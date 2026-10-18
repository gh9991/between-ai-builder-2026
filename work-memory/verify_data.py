"""Check historical views and references consumed by the visualization, for every scenario under data/scenarios/."""
import datetime as dt
import json
import re
from pathlib import Path
root=Path(__file__).resolve().parent
scenarios_dir=root/'data/scenarios'
index_src=(scenarios_dir/'index.js').read_text(encoding='utf-8')
registered=set(re.findall(r"from '\./([^/']+)/scenario\.json'",index_src))
folders={p.name for p in scenarios_dir.iterdir() if p.is_dir()}
assert folders==registered, f'scenario folders {sorted(folders)} must match index.js registrations {sorted(registered)}'

def check_scenario(folder):
    cfg=json.loads((folder/'scenario.json').read_text(encoding='utf-8'))
    d=json.loads((folder/'worklife.json').read_text(encoding='utf-8'))
    stories=json.loads((folder/'work-stories.json').read_text(encoding='utf-8'))
    assert cfg['id']==folder.name
    people={p['id']:p for p in d['people']}
    orgs={o['id'] for o in d['organisations']}
    projects={p['id'] for p in d['projects']}
    assert cfg['persona_id'] in people and cfg['home_org_id'] in orgs
    assert people[cfg['persona_id']]['organisation_id']==cfg['home_org_id']
    assert set(cfg['orgs'])<=orgs, 'scenario.json orgs must exist in worklife.json'
    assert set(cfg['projects'])<=projects, 'scenario.json projects must exist in worklife.json'
    missing_orgs={p['organisation_id'] for p in d['people']}-set(cfg['orgs'])
    assert not missing_orgs, f'people belong to orgs without a scenario.json layout: {sorted(missing_orgs)}'
    for o in cfg['orgs'].values():
        assert re.fullmatch(r'[0-9a-fA-F]{6}',o['color']) and len(o['position'])==3
    for p in cfg['projects'].values():
        assert re.fullmatch(r'[0-9a-fA-F]{6}',p['color']) and p['short']
    dates={s['date'] for s in d['snapshots']}
    assert d['snapshots'][0]['date']==d['manifest']['start'] and d['snapshots'][-1]['date']==d['manifest']['end']
    assert d['manifest']['default_snapshot'] in dates
    for m in cfg.get('month_markers',[]):assert m['date'] in dates, m
    for sd in cfg.get('special_days',[]):assert sd['from']<=sd['to'] and sd['label']
    assert set(cfg['stages'])>={s['stage'] for s in stories}, 'every story stage must be listed in scenario.json stages'
    rs={r['id']:r for r in d['records']}
    for story in stories:
        assert story['project_id'] in projects and set(story['source_ids'])<=set(rs)
    counts=[]
    for s in d['snapshots']:
        visible={r['id'] for r in rs.values() if r['first_seen_at']<=s['as_of']}
        nodes=s['connections']['nodes']
        assert len({n['person_id'] for n in nodes})==len(nodes)
        for n in nodes:
            assert set(n['source_ids'])<=visible
            assert n['first_observed_at']<=s['as_of']
            assert n['person_id']!=cfg['persona_id']
        for t in s['task_states']:
            assert set(t['source_ids'])<=visible
            if t['status']=='completed':
                assert rs[t['source_ids'][-1]]['task_status']=='completed'
        for p in s['desk']['project_states']:assert set(p['source_ids'])<=visible
        for decision in s['desk']['decisions']:assert set(decision['source_ids'])<=visible
        counts.append(len(nodes))
    assert counts==sorted(counts)
    check_person_view_contract(cfg,d,rs,people,projects)
    check_schedule(d,rs,people,projects,cfg.get('daily_project_id','studio'))
    return cfg,d,rs,counts

MILESTONE_KINDS={'deadline','submission','meeting','approval','decision','result','issue'}
MILESTONE_STATUSES={'done','slipped','upcoming','missed'}

def check_schedule(d,rs,people,projects,daily_project):
    """Optional project phases with dates and top-level milestones (Iris has neither); whatever is present must be consistent."""
    start,end=d['manifest']['start'],d['manifest']['end']
    for p in d['projects']:
        dated=[x for x in p.get('phases',[]) if 'start' in x]
        for x in dated:
            assert start<=x['start']<=x['end']<=end, f"{p['id']}: phase {x['id']} must lie inside the window"
        if dated:
            assert p['phase'] in {x['id'] for x in dated}, f"{p['id']}: current phase must be one of its phases"
    ms=d.get('milestones')
    if ms is None:return
    ids=set()
    for m in ms:
        assert m['id'] not in ids, m['id']; ids.add(m['id'])
        assert m['project_id'] in projects and m['kind'] in MILESTONE_KINDS and m['status'] in MILESTONE_STATUSES, m['id']
        assert m['source_ids'] and set(m['source_ids'])<=set(rs), f"{m['id']}: source records must exist"
        assert all(rs[x]['project_id']==m['project_id'] for x in m['source_ids']), m['id']
        assert m['people'] and set(m['people'])<=set(people), f"{m['id']}: people must resolve"
        assert m['label_origin']=='authored_oracle_not_model_output', m['id']
        if m['status']=='upcoming':
            assert m['actual_date'] is None, m['id']
        else:
            assert m['actual_date'], m['id']
        if m['status']=='slipped':
            assert m['actual_date']>m['planned_date'], f"{m['id']}: a slipped milestone ends after its planned date"
    for p in d['projects']:
        if p['id']!=daily_project and any(m['project_id']==p['id'] for m in ms):
            assert sum(m['project_id']==p['id'] for m in ms)>=5, f"{p['id']}: at least five milestones"

UNIT_TYPES={'feedback','task','update','file_pointer','decision','promise','question','small_talk'}
UNIT_STATUSES={'feedback':{'open','likely_addressed','addressed','reopened'},'question':{'open','answered'},'promise':{'open','late','kept'},'update':{'open','likely_addressed','addressed'}}
SIGNAL_KEYS=('wechat','email','meeting','teams','document')

def check_person_view_contract(cfg,d,rs,people,projects):
    """Work-memory data contract. Every part is optional (Iris has none of it); whatever is present must be consistent."""
    groups={g['id']:g for g in d.get('groups',[])}
    for g in groups.values():
        assert g['project_id'] in projects and set(g['member_ids'])<=set(people) and cfg['persona_id'] in g['member_ids'], g['id']
    for r in rs.values():
        if r.get('group_id'):
            assert r['group_id'] in groups and set(r['participant_ids'])==set(groups[r['group_id']]['member_ids']), r['id']
        if r['kind']=='document' and 'editor_ids' in r:
            assert r['editor_ids'] and set(r['editor_ids'])<=set(r['participant_ids']), r['id']
    last=d['snapshots'][-1]
    # A scenario may slim its snapshots and publish the full derived task list at the top level (architect does).
    tasks={t['id']:t for t in (d.get('tasks') or last['task_states'])}
    for t in tasks.values():
        if t.get('parent_task_id'):
            assert t['parent_task_id'] in tasks and tasks[t['parent_task_id']]['owner_id']==t.get('delegated_by'), t['id']
        if t.get('delegated_by'):
            assert t['delegated_by'] in people, t['id']
    decisions={x['id'] for x in (d.get('decisions') or last['desk']['decisions'])}
    ids=set()
    for u in d.get('work_units',[]):
        assert u['id'] not in ids and u['type'] in UNIT_TYPES, u['id']; ids.add(u['id'])
        r=rs[u['record_id']]
        assert u['project_id']==r['project_id'] and u['project_id'] in projects, u['id']
        assert u['from_id'] in r['participant_ids'] and u['to_ids'] and set(u['to_ids'])<=set(r['participant_ids']), u['id']
        assert u['label_origin']=='authored_oracle_not_model_output', u['id']
        if u['type']=='feedback':assert u['group_id'], u['id']
        if u['type']=='task':assert u['task_id'] in tasks, u['id']
        if u['type']=='decision':assert u['decision_id'] in decisions, u['id']
        if u['type']=='file_pointer':assert u['path'] and u['revision'], u['id']
        history=u['status_history']
        if u['type'] in ('feedback','question','promise'):assert history, u['id']
        if history:
            assert u['type'] in UNIT_STATUSES and history[0]['status']=='open' and history[0]['at']==r['first_seen_at'], u['id']
        prev=''
        for h in history:
            assert h['status'] in UNIT_STATUSES[u['type']] and h['at']>=prev, u['id']; prev=h['at']
            for e in h['evidence_ids']:
                assert rs[e]['first_seen_at']<=h['at'], f"{u['id']}: evidence {e} is not available at {h['at']}"
    prior={}
    for s in d['snapshots']:
        desk=s['desk']
        if 'focus_project_id' in desk:
            assert desk['focus_project_id'] is None or desk['focus_project_id'] in projects, s['date']
            assert desk.get('focus_basis'), s['date']
            for x in desk.get('focus_source_ids',[]):
                assert rs[x]['first_seen_at']<=s['as_of'], s['date']
        for n in s['connections']['nodes']:
            sig=n.get('signals')
            if sig is None:continue
            # Zero counts may be omitted (architect omits them to keep a 365-day file small); present ones must be ints.
            assert all(isinstance(sig['by_channel'].get(k,0),int) for k in SIGNAL_KEYS), (s['date'],n['person_id'])
            assert sig['last_contact_at']<=s['as_of'], (s['date'],n['person_id'])
            flat=[*(sig['by_channel'].get(k,0) for k in (*SIGNAL_KEYS,'assistant')),*(sig.get(k,0) for k in ('shared_groups','co_edited_files','shared_projects'))]
            old=prior.get(n['person_id'])
            if old:
                assert all(a>=b for a,b in zip(flat,old[0])) and sig['last_contact_at']>=old[1], f"signals decrease for {n['person_id']} on {s['date']}"
            prior[n['person_id']]=(flat,sig['last_contact_at'])

# Plain language for non-architects: no bare jargon or acronyms in titles and labels (case-sensitive word match).
JARGON=re.compile(r'\b(DD|CD|GFA|NLA|RFI|LDI|MEP|BIM|GF|B1|[Ss]ubmittals?|[Aa]ddend(?:um|a)|[Tt]ender(?:s|ed|ing)?|Rev)\b|core & façade package')

# Trade words a non-architect would not follow. In a message body, transcript, minutes, work-unit text or decision text
# such a word may appear only if the same message explains it: at least one occurrence sits inside brackets or is
# followed by a bracketed explanation, e.g. "the podium (the lower floors under the tower)".
TRADE=re.compile(r'\b(?:(?:DD|CD|GFA|NLA|RFIs?|LDI|MEP|BIM|GF|B1|FFL|Rev [A-Z]|Revit)|(?i:submittals?|addend(?:um|a)|tender(?:s|ed|ing)?'
    r'|podiums?|ground anchors?|setbacks?|egress|transfer beams?|soffits?|mullions?|core|shop drawings?|value engineering|prelims'
    r'|provisional sums?|practical completion|risers?|transmittals?|massings?|modules?|unitised|mass concrete|blinding|footings?'
    r'|spec|specification|elevations?|renders?|grid|anchors?|frontages?|clash(?:es)?|programme|curtain wall|slabs?|reinforcement'
    r'|honorarium|title blocks?|provisional|inclusions|exclusions|setting-out|retaining walls?|lettable|disciplines?'
    r'|tenanc(?:y|ies)|boreholes?|clear height|bays?))\b')
BARE_VERSION=re.compile(r'\b(?:[Vv]ersion|Rev) [A-H]\b')

# AI-engineering jargon for the ai_engineer scenario (keep in sync with synthetic-worklife/scenarios/ai_engineer/build.py).
# Titles, labels, roles and plain fields must not contain it at all; message bodies, transcripts, minutes, work-unit
# text and decisions may use it only when the same message explains it in brackets, e.g. "the test set (300 real questions)".
AI_JARGON=re.compile(r'\b(?:RAG|LLMs?|PoCs?|POCs?|APIs?|PII|MLOps|CI/CD|A/B|p9[59]|GPUs?|SLAs?|KPIs?|OCR|IDP|SSO|ETL|RBAC|JSON)\b'
    r'|\b(?i:evals?|embeddings?|vector (?:db|database|store|search)|fine-?tun(?:e|ed|ing)|prompts?|tokens?|latency|hallucinat\w*|inference'
    r'|retrieval|chunk(?:s|ing)?|guardrails?|benchmarks?|agentic|endpoints?|deploy(?:s|ed|ing|ment)?|regressions?|pipelines?|golden set'
    r'|ground truth|confidence scores?|thresholds?|rate limits?|context window|model drift|LLM-as-judge|sprints?|backlog|staging|repo)\b')

# Plain-language rules per scenario: (pattern banned in titles and labels, pattern allowed in bodies only when explained).
# Every scenario with the schedule / plain-field contract (milestones) must have an entry.
PLAIN_RULES={'architect':(JARGON,TRADE),'ai_engineer':(AI_JARGON,AI_JARGON)}

def unexplained(text,trade=TRADE):
    text=re.sub(r'\S*/\S*','',text)                          # file paths
    text=re.sub(r'\b(?:DOC|TX|BP|R|SK|S|A|L)-[\w-]+','',text)  # document, sheet and record ids
    seen={}
    for m in trade.finditer(text):
        i,j=m.start(),m.end()
        o,c=text.rfind('(',0,i),text.rfind(')',0,i)
        ok=text[j:j+2]==' (' or (o>c and text.find(')',j)!=-1)
        k=m.group(0).lower(); seen[k]=seen.get(k,False) or ok
    bad=[k for k,ok in seen.items() if not ok]
    v=BARE_VERSION.search(text)   # the first version letter must say which drawing set it is
    if v and not re.search(r'drawing|plan|set|layout|floor|sheet',text[max(0,v.start()-60):v.end()+60],re.I):
        bad.append(v.group(0))
    return bad

def check_plain_bodies(d,rs,trade):
    msgs=[(r['id'],'\n'.join([r['title'],r['body'],*[t['text'] for t in r.get('transcript',[])],*r.get('minutes',[])])) for r in rs.values()]
    msgs+=[(u['id'],'\n'.join([u['text'],*[h.get('note') or '' for h in u['status_history']]])) for u in d['work_units']]
    msgs+=[(x['id'],x['value']+'\n'+x['explanation']) for x in (d.get('decisions') or d['snapshots'][-1]['desk']['decisions'])]
    for where,text in msgs:
        bad=unexplained(text,trade)
        assert not bad, f'{where}: unexplained trade words {bad}'

def check_plain_language(cfg,d,rs,stories):
    jargon,trade=PLAIN_RULES[cfg['id']]
    for p in d['projects']:
        assert p.get('plain_zh') and p.get('plain_en'), f"{p['id']}: plain_zh / plain_en"
    for person in d['people']:
        assert person.get('role') and person.get('role_zh'), f"{person['id']}: role / role_zh"
    texts=[(r['id'],r['title']) for r in rs.values()]
    texts+=[(m['id'],m[k]) for m in d['milestones'] for k in ('title_zh','title_en','plain_zh','plain_en')]
    texts+=[(f"{p['id']}.{x['id']}",x[k]) for p in d['projects'] for x in p['phases'] for k in ('label_zh','label_en','plain_zh','plain_en')]
    texts+=[(s['id'],s[k]) for s in stories for k in ('title_zh','title_en')]
    texts+=[(f"{p['id']}.{k}",p[k]) for p in d['projects'] for k in ('name','name_zh','plain_zh','plain_en')]
    texts+=[(f"{p['id']}.{k}",p[k]) for p in d['people'] for k in ('role','role_zh')]
    texts+=[(f"scenario.{pid}.{k}",p[k]) for pid,p in cfg['projects'].items() for k in ('short','short_en') if k in p]
    texts+=[(f"status.{k}",v) for k,v in cfg['status_labels'].items()]
    for where,text in texts:
        assert text, f'{where}: missing plain text'
        m=jargon.search(text)
        assert not m, f'{where}: bare jargon "{m.group(0)}" in "{text}"'
    check_plain_bodies(d,rs,trade)

# Student scenario: data-science and academic words a non-specialist would not follow. Titles and labels must avoid them;
# bodies may use them only with a bracketed explanation in the same message (same rule as TRADE above).
STUDENT_JARGON=re.compile(r'\b(EDA|ETL|ROC|AUC|F1|LMS|HD|HREC|DAA|API|SQL|GPA|WAM|NLP|LLMs?|KPIs?|CSV|STAR|[Cc]apstone|[Rr]ubrics?|[Oo]verfit(?:ting)?|[Hh]yperparameters?'
    r'|[Cc]ross-validation|Jupyter|pandas|[Rr]egression|[Ll]eakage|[Ii]mputation|[Bb]aselines?|[Pp]ipelines?|[Dd]ata dictionary|[Ee]thics approval|[Ss]pecial consideration'
    r'|[Aa]ssessment centre|[Pp]sychometric|[Nn]eural networks?|[Rr]andom forests?|[Bb]oosted trees|[Dd]ecision trees?|[Ss]takeholders?|[Dd]eliverables?)\b')
STUDENT_TRADE=re.compile(r'\b(?:(?:EDA|ETL|ROC|AUC|F1|LMS|HD|HREC|DAA|API|SQL|GPA|WAM|NLP|LLMs?|KPIs?|CSV|STAR)|(?i:capstone|rubrics?|overfit(?:ting)?|hyperparameters?'
    r'|cross-validation|jupyter|pandas|logistic regression|regression|random forests?|boosted trees|gradient boosting|decision trees?|neural networks?|baselines?'
    r'|precision|recall|confusion matrix|data dictionary|pipelines?|data leakage|leakage|imputation|outliers?|training set|test set|validation set|ethics approval'
    r'|special consideration|census date|moderation|credit points|assessment centre|psychometric|stakeholders?|deliverables?|embeddings?|fine-tun(?:e|ed|ing)'
    r'|scikit-learn|github|repositor(?:y|ies)|algorithms?|clustering|coefficients?))\b')
PLAIN_RULES['student']=(STUDENT_JARGON,STUDENT_TRADE)

ARCHITECT_PROJECTS={  # id: (status, outcome, closed_at, final phase)
    'harbour_library':('closed','lost','2025-12-05','closed'),'bayside_hall':('closed','built','2026-01-23','closed'),
    'lakeside':('active',None,None,'construction'),'hk_tower':('active',None,None,'hk_continues'),
    'harbour_clinic':('closed','built','2026-05-08','closed'),'grand_hotel':('closed','lost','2026-03-06','closed'),
    'elm_townhouses':('closed','delivered_not_proceeding','2026-03-27','closed'),'northgate':('active',None,None,'cd_prep'),
    'westpark_hospital':('on_hold',None,None,'on_hold'),'pier_apartments':('closed','lost','2026-06-12','closed'),
    'corner_cafe':('active',None,None,'build'),'riverside':('active',None,None,'result'),'studio':('active',None,None,'ongoing')}

def check_architect(d,rs):
    """One year of Grace's work (1 Oct 2025 - 30 Sep 2026): twelve projects plus the studio, with the Q3 2026 story kept."""
    snaps=d['snapshots']; bydate={s['date']:s for s in snaps}
    assert len(snaps)==365 and snaps[0]['date']=='2025-10-01' and snaps[-1]['date']=='2026-09-30' and d['manifest']['default_snapshot']=='2026-09-30'
    # The world starts tiny and grows: Rose and Dian on day one, everyone by the end.
    count=lambda day:len(bydate[day]['connections']['nodes'])
    assert {n['person_id'] for n in bydate['2025-10-01']['connections']['nodes']}=={'rose','dian'}
    assert count('2026-01-01')>=15 and count('2026-04-01')>count('2026-01-01') and count('2026-07-01')>count('2026-04-01')
    people=[p for p in d['people'] if p['id']!='grace']
    assert count('2026-09-30')==len(people)>=40, (count('2026-09-30'),len(people))
    names=[p['name'] for p in d['people']]
    assert len(names)==len(set(names)), 'duplicate names in the architect cast'
    # AI assistants arrive during the year, not on day one.
    first={n['person_id']:n['first_observed_at'][:10] for n in snaps[-1]['connections']['nodes']}
    assert all(first[a]>='2026-03-01' for a in ('atlas','revit_audit','scribe')), first
    # Project lifecycle: status, outcome, closed_at, final phase; Grace's own periods; the desk follows the date.
    projects={p['id']:p for p in d['projects']}
    assert set(projects)==set(ARCHITECT_PROJECTS)
    for pid,(status,outcome,closed_at,phase) in ARCHITECT_PROJECTS.items():
        p=projects[pid]
        assert (p['status'],p['outcome'],p['closed_at'],p['phase'])==(status,outcome,closed_at,phase), pid
        assert p['kind'] and p['grace_role'] and p['grace_periods'] and (p['building_type'] or pid=='studio'), pid
        assert all(x['start']<=x['end'] for x in p['phases']), pid
        state=lambda day:next((x for x in bydate[day]['desk']['project_states'] if x['id']==pid),None)
        if closed_at:
            before=(dt.date.fromisoformat(closed_at)-dt.timedelta(days=1)).isoformat()
            assert state(closed_at)['status']=='closed' and state(closed_at)['outcome']==outcome and state(before)['status']!='closed', pid
            assert p['phases'][-1]['id']=='closed' and p['phases'][-1]['start']==closed_at, pid
        else:
            assert state('2026-09-30')['status']!='closed', pid
    hk=projects['hk_tower']
    assert hk['grace_periods']==[{'from':'2025-11-10','to':'2026-01-16'}] and hk['status']=='active'
    assert not [r for r in rs.values() if r['project_id']=='hk_tower' and r['actor_id']=='grace' and r['occurred_at'][:10]>'2026-01-16'], 'Grace stops working on the Hong Kong tower after 16 January'
    wp=lambda day:next(x for x in bydate[day]['desk']['project_states'] if x['id']=='westpark_hospital')['status']
    assert wp('2026-06-04')!='on_hold' and wp('2026-06-05')=='on_hold' and wp('2026-09-30')=='on_hold'
    assert any(r['project_id']=='westpark_hospital' and r['occurred_at'][:7]=='2026-09' for r in rs.values()), 'a still-on-hold note in September'
    # Milestones for every project; the two Q3 slips are kept.
    ms=d['milestones']
    assert {m['project_id'] for m in ms}==set(ARCHITECT_PROJECTS)-{'studio'} and 70<=len(ms)<=95, len(ms)
    slipped={m['id']:(m['planned_date'],m['actual_date']) for m in ms if m['status']=='slipped'}
    assert slipped.get('NG-M10')==('2026-09-18','2026-09-25') and slipped.get('NG-M06')==('2026-08-21','2026-09-03'), slipped
    assert all(r['source_system']!='wechat' for r in rs.values())
    assert 1150<=len(rs)<=1500 and sum(r['first_seen_at']>='2026-07-01' for r in rs.values())>=500, len(rs)
    # Leave, studio closure and the focus project.
    assert bydate['2026-09-30']['desk']['focus_project_id']=='riverside'
    assert all(bydate[x]['desk']['focus_project_id'] is None for x in ('2026-08-24','2026-08-26','2026-08-28','2026-06-19','2025-12-24','2026-01-01'))
    closed_days={'2025-12-24','2025-12-25','2025-12-26','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02'}
    assert not [r['id'] for r in rs.values() if r['first_seen_at'][:10] in closed_days], 'nothing is read while the studio is closed'
    focus={s['desk']['focus_project_id'] for s in snaps}-{None}
    assert len(focus)>=10, focus
    # Nothing left open by accident: no task more than three weeks overdue on 30 Sep, no open task in a closed project
    # after it closed (or on the Hong Kong tower after Grace's hand-back), no open question or feedback in a closed project.
    OVERDUE_OK=set()  # deliberately overdue task ids (none)
    for t in bydate['2026-09-30']['task_states']:
        if t['status']!='completed' and t['due_date']:
            assert t['id'] in OVERDUE_OK or (dt.date(2026,9,30)-dt.date.fromisoformat(t['due_date'])).days<=21, f"{t['id']} overdue since {t['due_date']}"
    ends={pid:p['closed_at'] for pid,p in projects.items() if p['closed_at']}; ends['hk_tower']='2026-01-16'
    for s in snaps:
        for t in s['task_states']:
            if t['project_id'] in ends and s['date']>ends[t['project_id']]:
                assert t['status']=='completed', (t['id'],s['date'])
    LATE_OK={'R-LK-224'}  # Daniel's ground-test promise was broken; the level was left to be confirmed on site (Q3 rock question)
    for u in d['work_units']:
        if not u['status_history']:continue
        final=u['status_history'][-1]['status']
        if u['project_id'] in ends:
            assert final not in ('open','reopened','late') or u['record_id'] in LATE_OK, (u['id'],final)
        if final=='late':assert u['record_id'] in LATE_OK, u['id']
    # The kept Q3 story.
    status=lambda day,pid:next(x for x in bydate[day]['desk']['project_states'] if x['id']==pid)['status']
    assert status('2026-09-28','riverside')=='interviewed' and status('2026-09-29','riverside')=='won' and status('2026-09-21','lakeside')=='on_site'
    end=bydate['2026-09-30']['as_of']
    fb=[u for u in d['work_units'] if u['group_id']=='FB-RV-0929']
    st=[[h for h in u['status_history'] if h['at']<=end][-1]['status'] for u in fb]
    assert len(fb)==5 and st.count('likely_addressed')==2 and st.count('open')==3, st

def check_annual_extension(d,rs,scenario):
    assert d['manifest']['start']=='2025-10-01' and d['manifest']['end']=='2026-09-30'
    assert len(d['snapshots'])==365 and len(d['projects'])==12
    assert 1000<=len(rs)<=1500
    months={r['first_seen_at'][:7] for r in rs.values()}
    assert len(months)==12 and min(months)=='2025-10' and max(months)=='2026-09'
    assert len(d['work_units'])>=450
    final=d['snapshots'][-1]
    assert len(final['connections']['nodes'])==len(d['people'])-1, 'every profile needs a source interaction'
    assert len(d['snapshots'][0]['connections']['nodes']) < len(final['connections']['nodes'])/3
    old_ids={'capstone','ml','career','life'} if scenario=='student' else {'support_ai','client_docs','model_upgrade','team'}
    new=[p for p in d['projects'] if p['id'] not in old_ids]
    assert len(new)==8
    for p in new:
        records=[r for r in rs.values() if r['project_id']==p['id']]
        assert len(records)>=60, p['id']
        assert {'email','chat','meeting','document','calendar','task_update'} <= {r['kind'] for r in records}
        assert sum(m['project_id']==p['id'] for m in d['milestones'])==5
        assert len(p['phases'])==5
        assert p['status'] in ('closed','on_hold')
        assert next(x for x in final['desk']['project_states'] if x['id']==p['id'])['status']==p['status']
        for r in records:
            if r['kind']=='document' and r.get('version')==2:
                assert rs[r['supersedes_record_id']]['document_id']==r['document_id']
            if r['id'].endswith('-peer'):
                assert r['actor_id']!='grace' and r['editor_ids']==[r['actor_id']]
        first=min(r['first_seen_at'] for r in records)
        before=[s for s in d['snapshots'] if s['as_of']<first]
        assert all(p['id'] not in [x['id'] for x in s['desk']['project_states']] for s in before)
    # A slipped task stays open at its original due date and completes only on the actual date.
    bydate={s['date']:s for s in d['snapshots']}
    delayed=[m for m in d['milestones'] if m['id'].startswith('M-Y-') and m['status']=='slipped']
    assert len(delayed)==2
    for m in delayed:
        task_id='T-'+m['id'][2:]
        planned=next(t for t in bydate[m['planned_date']]['task_states'] if t['id']==task_id)
        actual=next(t for t in bydate[m['actual_date']]['task_states'] if t['id']==task_id)
        assert planned['status']!='completed' and actual['status']=='completed'
        assert planned['due_date']==actual['due_date']==m['planned_date']
    # Revised copies cite earlier feedback, never a future review or acceptance.
    for r in rs.values():
        if r['id'].startswith('R-Y-') and r['id'].endswith('-v2'):
            feedback=rs[r['id'][:-3]+'-feedback']
            assert feedback['first_seen_at'] < r['first_seen_at']
    # No invented progress during the year-end closure, or classes leaked into a future course.
    assert not any(r['actor_id']=='grace' and r['kind'] in ('document','meeting','task_update') and '2025-12-24'<=r['occurred_at'][:10]<='2026-01-02' for r in rs.values())
    if scenario=='student':
        assert not any(r['project_id']=='ml' and r['first_seen_at']<'2026-07-01' for r in rs.values())
    else:
        assert next(x for x in final['desk']['project_states'] if x['id']=='renewal_study')['status']=='on_hold'

def check_student(d,rs):
    bydate={s['date']:s for s in d['snapshots']}
    check_annual_extension(d,rs,'student')
    assert {'sarah','chloe'} <= {n['person_id'] for n in bydate['2026-07-01']['connections']['nodes']}
    assert len(bydate['2026-09-30']['connections']['nodes'])==33
    assert {'capstone','ml','career'} <= {m['project_id'] for m in d['milestones']} and len(d['milestones'])==77
    ms={m['id']:m for m in d['milestones']}
    slipped={k:(m['planned_date'],m['actual_date']) for k,m in ms.items() if m['status']=='slipped'}
    assert {k:v for k,v in slipped.items() if not k.startswith('M-Y-')}=={'CP-M06':('2026-08-07','2026-08-25'),'CP-M09':('2026-08-10','2026-08-28'),'CP-M11':('2026-09-16','2026-09-23'),'JB-M06':('2026-08-24','2026-08-31')}, slipped
    assert all(r['source_system']!='wechat' for r in rs.values())
    assert all(r['first_seen_at']==r['recorded_at'] for r in rs.values())  # no sick days or leave: Grace reads things as they arrive
    assert {p['id']:p['phase'] for p in d['projects'] if p['id'] in ('capstone','ml','career','life')}=={'capstone':'midpoint','ml':'break','career':'offer','life':'ongoing'}
    assert bydate['2026-09-30']['desk']['focus_project_id']=='career'
    # Machine Learning coursework: eight labs, two quizzes, Assignment 1 on time, test, talk with peer review, Assignment 2.
    labs=[rs[f'R-ML-LAB{n}'] for n in range(1,9)]
    assert all(r['kind']=='document' and r['source_system']=='lms' and r['actor_id']=='grace' for r in labs)
    assert all(rs[q]['source_system']=='lms' for q in ('R-ML-Q1','R-ML-Q2','R-ML-PEER','R-ML-027'))
    assert (ms['ML-M05']['planned_date'],ms['ML-M05']['actual_date'],ms['ML-M05']['status'])==('2026-08-28','2026-08-27','done')
    assert all(ms[k]['status']=='done' for k in ('ML-M03','ML-M04','ML-M06','ML-M07','ML-M08','ML-M09','ML-M10'))
    current={x['id']:x['is_current'] for x in bydate['2026-09-30']['desk']['decisions']}
    assert current['D-CP-DATA-3'] and not current['D-CP-DATA-2'] and not current['D-CP-DATA-1'] and current['D-ML-SPLIT-2'] and not current['D-ML-PAIR']
    end=bydate['2026-09-30']['as_of']
    at_end=lambda g:[[h for h in u['status_history'] if h['at']<=end][-1]['status'] for u in d['work_units'] if u['group_id']==g]
    status=at_end('FB-CP-MID')
    assert len(status)==3 and status.count('likely_addressed')==1 and status.count('open')==2, status
    assert at_end('FB-ML-A1')==['likely_addressed']*3  # the tutor's Assignment 1 comments are acted on in Assignment 2

def check_ai_engineer(d,rs):
    bydate={s['date']:s for s in d['snapshots']}
    check_annual_extension(d,rs,'ai_engineer')
    assert {'priya','lucas'} <= {n['person_id'] for n in bydate['2026-07-01']['connections']['nodes']}
    assert len(bydate['2026-09-30']['connections']['nodes'])==30
    assert 1000<=len(rs)<=1500, len(rs)
    # Preserve the original quarter's communication mix; the extension includes more documents.
    kinds=[r['kind'] for r in rs.values() if r['occurred_at'][:10]>='2026-07-01']
    assert 0.2<=kinds.count('email')/len(kinds)<=0.3 and 0.2<=kinds.count('chat')/len(kinds)<=0.3
    assert all(r['source_system']!='wechat' for r in rs.values())
    assert {'support_ai','client_docs','model_upgrade'} <= {m['project_id'] for m in d['milestones']} and len(d['milestones'])==74
    slipped={m['id']:(m['planned_date'],m['actual_date']) for m in d['milestones'] if m['status']=='slipped'}
    assert slipped.get('SA-M10')==('2026-09-08','2026-09-15') and slipped.get('KF-M05')==('2026-07-31','2026-08-19') and slipped.get('MU-M09')==('2026-09-17','2026-09-21'), slipped
    upcoming=[m for m in d['milestones'] if m['status']=='upcoming']
    assert len(upcoming)>=2 and all(m['planned_date'].startswith('2026-10') for m in upcoming)
    assert {p['id']:p['phase'] for p in d['projects'] if p['id'] in ('support_ai','client_docs','model_upgrade','team')}=={'support_ai':'aftercare','client_docs':'proposal','model_upgrade':'savings','team':'ongoing'}
    assert bydate['2026-09-30']['desk']['focus_project_id']=='model_upgrade'
    assert all(bydate[x]['desk']['focus_project_id'] is None for x in ('2026-08-17','2026-08-19','2026-08-21','2026-09-28'))
    current={x['id']:x['is_current'] for x in bydate['2026-09-30']['desk']['decisions']}
    assert current['D-SA-INSERT-2'] and not current['D-SA-INSERT-1'] and current['D-MU-SWITCH-2'] and not current['D-MU-SWITCH-1']
    end=bydate['2026-09-30']['as_of']
    fb=[u for u in d['work_units'] if u['group_id']=='FB-MU-0929']
    status=[[h for h in u['status_history'] if h['at']<=end][-1]['status'] for u in fb]
    assert len(fb)==4 and status.count('likely_addressed')==2 and status.count('open')==2, status

def check_iris(d,rs,counts):
    assert len(rs)==423
    assert len(d['snapshots'])==92
    assert counts[0]==3 and counts[-1]==21
    bydate={s['date']:s for s in d['snapshots']}
    assert 'nadia' not in [n['person_id'] for n in bydate['2026-09-15']['connections']['nodes']]
    assert 'nadia' in [n['person_id'] for n in bydate['2026-09-16']['connections']['nodes']]
    assert next(t for t in bydate['2026-08-21']['task_states'] if t['id']=='T09')['overdue']
    guide=next(t for t in bydate['2026-08-24']['task_states'] if t['id']=='T09')
    assert guide['due_date']=='2026-08-14'
    assert rs[guide['source_ids'][-1]]['occurred_at'][:10]=='2026-08-24'

summary=[]
for folder in sorted(scenarios_dir.iterdir()):
    if not folder.is_dir():continue
    cfg,d,rs,counts=check_scenario(folder)
    if cfg['id']=='iris':check_iris(d,rs,counts)
    if cfg['id']=='architect':check_architect(d,rs)
    if cfg['id']=='ai_engineer':check_ai_engineer(d,rs)
    if cfg['id']=='student':check_student(d,rs)
    if 'milestones' in d:  # scenarios with the schedule / plain-field contract (all but Iris) must read plainly
        assert cfg['id'] in PLAIN_RULES, f"{cfg['id']}: add plain-language rules to PLAIN_RULES"
        check_plain_language(cfg,d,rs,json.loads((folder/'work-stories.json').read_text(encoding='utf-8')))
    summary.append(f"{cfg['id']}: {len(d['snapshots'])} historical views, {len(rs)} sources")
print('PASS: '+'; '.join(summary)+'; entity discovery, visible evidence, scenario config, late completion and person-view data contract.')
