# Deployment

The competition deployment uses Google Cloud project `between-511505`, region `australia-southeast1` and Cloud Run service `between-web`.

## Continuous deployment

Connect `gh9991/between-ai-builder-2026` through the Cloud Build GitHub App. Configure a push trigger for `^main$`, using `cloudbuild.yaml` and the existing `between-build` service account. Builds check the application, publish a container to Artifact Registry, deploy to Cloud Run and verify the public release commit.

The runtime service account is `between-web`. It reads the pinned archive from Firestore with database-scoped `roles/datastore.viewer`; it does not need write or model permissions. Keep credentials outside the repository.

## Archive updates

From an authenticated environment with Firestore import permissions:

```sh
npm run setup
npm run build
node deploy/import-firestore.mjs between-511505
```

Import the archive before deploying code that references its new version. The importer writes immutable archive parts and verifies the read-back. The web API serves only that version through GET/HEAD.

The default viewer uses a packaged copy of the same archive. `?mode=cloud` reads through the API from Firestore. This allows local previews without cloud credentials.

## Verification

```sh
npm run check
node deploy/smoke.mjs https://between-web-459469440461.australia-southeast1.run.app COMMIT_SHA
```

`/version.json` identifies the serving commit. Confirm My Desk, Connections, Project Timeline and My Contributions after deployment. For recovery, route Cloud Run traffic to a previously verified revision; the original repository is not the automatic deployment source for this release.
