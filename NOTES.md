# SuperrDev Patch Exercise - Technical Notes

## 1. Identified Issues & Solutions

### Issue 1: Broken SQL Boolean Precedence in Repository (Critical Bug)
- **What was the issue:** In `TaskRepository.java`, the native SQL query had missing parentheses around conditions (`AND` / `OR` mixing). Due to SQL operator precedence (`AND` evaluated before `OR`), searching by description bypassed the `archived = FALSE` check (leaking archived/deleted records) and ignored the status filter when titles matched.
- **How found:** Audited the native SQL query in `TaskRepository.java` and verified inconsistent search filter behaviors across titles and descriptions.
- **What changed:** Enclosed title/description search logic in parentheses and bound the status check properly:
  `WHERE archived = FALSE AND (LOWER(title) LIKE :term OR LOWER(description) LIKE :term) AND (:status IS NULL OR status = :status)`.
- **Why:** To ensure archived records remain strictly excluded and status filters are reliably enforced regardless of whether the search matched the title or description.

---

### Issue 2: Artificial Request Latency via Thread Blocking (Performance Bug)
- **What was the issue:** In `TaskController.java`, incoming requests were artificially delayed using `Thread.sleep(queryWeight)` where `complexityScore = Math.max(0, 10 - query.length())`. An empty search delayed server execution by 1000ms.
- **How found:** Observed slow API response times and logs indicating `complexity=10` on initial load. Code review revealed hardcoded thread sleeping logic.
- **What changed:** Removed `complexityScore`, `queryWeight`, and the `Thread.sleep()` block completely.
- **Why:** Blocking Tomcat worker threads severely drops server throughput and causes unacceptable user latency. Production APIs should return immediately.

---

### Issue 3: Unhandled Exception on Invalid Status (Reliability Bug)
- **What was the issue:** In `TaskController.java`, `TaskStatus.valueOf(status.toUpperCase())` was called directly without exception handling. Any invalid status value in the query parameter caused an unhandled `IllegalArgumentException`, returning HTTP 500.
- **How found:** Code inspection of the parameter normalization in `TaskController.java`.
- **What changed:** Wrapped enum parsing in a try-catch block and returned HTTP 400 Bad Request with a clear error message on invalid input.
- **Why:** Client-side invalid inputs should yield standard `4xx` responses rather than unhandled internal server crashes.

---

### Issue 4: Edge-Case Pagination Crash (Boundary Bug)
- **What was the issue:** Passing `page <= 0` produced a negative `start` index (`(page - 1) * pageSize`), causing `allResults.subList()` to throw `IndexOutOfBoundsException` (HTTP 500). Furthermore, `pageSize` was unbounded.
- **How found:** Traced index calculation math in `TaskController.java` with zero and negative page inputs.
- **What changed:** Enforced minimum bounds using `Math.max(1, page)` and clamped `pageSize` to a maximum ceiling of 100.
- **Why:** Protects the controller against illegal argument crashes and memory exhaustion from excessively large page sizes.

---

### Issue 5: Infinite Loading State on API Error (Frontend Bug)
- **What was the issue:** In `frontend/src/hooks/useTasks.js`, the `.catch()` handler only updated `error` state but failed to set `loading` to `false`. When the backend was unavailable or returned an error, the UI remained frozen displaying "Loading tasks...".
- **How found:** Simulated API downtime / network failures; observed the table never exited the loading state.
- **What changed:** Added `setLoading(false)` to the `.catch()` block and reset `setError(null)` on every new request trigger.
- **Why:** The UI must acknowledge failure, stop loading animations, and clearly present error messages to the user.

---

### Issue 6: Keystroke Flooding & Race Conditions (Frontend Performance/UX)
- **What was the issue:** Fast typing triggered an API request for every keystroke. Additionally, there was no cancellation or out-of-order response handling, allowing older slow requests to overwrite newer results.
- **How found:** Audited the `useEffect` hook in `useTasks.js` for debounce and cleanup patterns.
- **What changed:** Implemented a 300ms debounce timer and an `isCancelled` flag inside `useEffect` cleanup.
- **Why:** Prevents request flooding to the backend and guarantees that the UI only displays data from the latest active query.

---

### Issue 7: Pagination State Desynchronization (Frontend UX Bug)
- **What was the issue:** When users changed the search query or status filter while on page > 1, the page number did not reset, resulting in empty state views if the new search had fewer pages.
- **How found:** Navigated to Page 2, typed a specific search filter, and noticed empty results despite matching items existing on Page 1.
- **What changed:** Added `handleQueryChange` and `handleStatusChange` handlers in `App.jsx` that invoke `setPage(1)` alongside updating filters.
- **Why:** Searching or filtering defines a new result set that must logically start from the first page.

---

### Issue 8: Unsafe Property Access on Task Status (Frontend Crash Defense)
- **What was the issue:** In `TaskTable.jsx`, `task.status.toLowerCase()` was executed directly. Any null or undefined status field would crash React rendering.
- **How found:** Reviewed JSX rendering in `TaskTable.jsx`.
- **What changed:** Added safe fallback defaults `(task.status || 'UNKNOWN')`.
- **Why:** Prevents runtime TypeError crashes on unexpected API payloads.

---

## 2. Assumptions Recorded
- **Status Filter:** Filter queries are assumed to match valid `TaskStatus` enum values (`OPEN`, `IN_PROGRESS`, `DONE`). Any unknown value is treated as bad request input.
- **Pagination Limits:** `pageSize` is clamped to 100 to prevent denial-of-service memory consumption.
- **In-Memory Pagination:** Kept repository-level native query filtering with controller slicing to preserve existing application structure while fixing functional bugs.