# Manage Tasks V.R.0.1.10

Deploy the backend before publishing assign.html:

    firebase deploy --only functions:prepareAdminAssignedTasks

Publish functions/manage-task-data.js with functions/index.js as part of that deployment. The page requires the response purpose manage-tasks-v1 and will not fall back to downloading every TASK document if an old backend responds.

The backend uses the existing assigned-date snapshot service and existing assignedDate/updatedAt index. It filters completed/deleted tasks and projects only Manage Tasks fields before responding, including legacy tasks without status/deleted fields. Each response has at most 1,000 active tasks. A watermark check prevents combining pages from different snapshot versions.

The first snapshot build for a date still reads that date's source documents. This is not a zero-read migration or a guarantee of immediate first load. Reused snapshots read changes rather than rereading every source document, and return only active task details to the browser. Existing admin mode and BA requirements remain unchanged. No production query or deployment was performed during implementation.

Validation: node test-assign-optimized.mjs; node test-assign-progressive.mjs; node test-assign-loading.mjs. These use local mock data only. After deployment, start with one date and inspect browser-transfer counts, estimated backend reads, and preparation time before testing a larger range.
