# Manage Tasks V.R.0.1.12

The page now uses purpose manage-tasks-v2 on prepareAdminAssignedTasks. This path queries TASK directly by assignedDate plus an OR of workStatus/status pending and for-download values. It projects only Manage Tasks fields. The legacy manage-tasks-v1 snapshot path and existing admin BA-scope path remain available for older pages.

Deploy the backend and supporting indexes before publishing assign.html:

    firebase deploy --only firestore:indexes,functions:prepareAdminAssignedTasks --project driva-pwa --non-interactive

The assignedDate/workStatus and assignedDate/status dedicated indexes were created on November 28, 2026 and were still CREATING at the final metadata check. A live pageSize=1 direct query succeeded using available indexes: one returned candidate, one estimated document read, queryMs=1007, processingMs=1. This is not a full-day performance benchmark. Wait for the dedicated indexes to be READY before a large comparison test. Index deployment acknowledgement alone does not mean an index has finished building. No full-date scan is used as a fallback.

All matching tasks load automatically, across all BAs, with up to 1,000 status candidates per request. Known case/separator formats and legacy status-only PENDING records are queried. Values outside the documented pending/for-download variants need normalization before they can match a direct equality query. Deleted records and conflicting completed/cancelled statuses are removed after candidate retrieval; therefore candidate reads can exceed returned records. Cursor advancement uses the last candidate, even for pages with zero visible tasks.

Diagnostics separately show cumulative server query time and server processing time; times can overlap across concurrent date requests. Estimated server reads refer to document candidates, not a billing statement or index-entry read count. Actual speed must be measured after deployment rather than inferred from fewer records.

Local validation:

    node test-assign-direct-query.mjs
    node test-assign-optimized.mjs
    node test-assign-progressive.mjs
    node test-assign-loading.mjs

These tests use mock data and do not read production tasks. Page publishing through GitHub remains separate from Firebase deployment.

Deployment status: prepareAdminAssignedTasks direct v2 backend deployed successfully to driva-pwa / asia-southeast1 on November 28, 2026. assign.html V.R.0.1.12 is saved locally and must be published separately to use the direct v2 route. Existing V.R.0.1.11 continues to use the snapshot route. No full-day task query was run during verification.
