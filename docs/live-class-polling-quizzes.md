# Live Class Polling and Quick Quizzes

StudiesTalk live sessions now support teacher-led polls and quizzes inside the existing live controls flow.

## Behavior

- `poll` is for opinion or check-in prompts.
- `quiz` is the same interaction model, but it can mark one option as correct.
- New polls start as `draft`.
- Teacher or school admin can open and close them during class.
- Students can answer only when:
  - they belong to the same workspace
  - they can access the live session
  - they are approved for the session under the waiting-room rules
  - the poll is currently open

## Permissions

- Teacher, admin, and school admin in the same workspace can:
  - create
  - open
  - close
  - delete
  - view full results
- Students can:
  - list visible non-draft polls in the same live session
  - answer open polls after approval/join access is satisfied
  - view result totals
- `super_admin` is blocked from private school live poll content by default.
- Cross-tenant access returns:

```json
{ "error": "Forbidden", "code": "tenant_forbidden" }
```

## Result Visibility

- Results include:
  - total responses
  - total selections
  - option counts
  - percentages
  - quiz correctness counts when a correct option exists
- If `anonymous_results=true`, individual student identity is hidden from result payloads.
- If anonymous mode is off, named respondent details are only exposed to teacher/admin managers.

## Anonymous Mode

- Anonymous mode hides respondent identity in results.
- It does not remove the audit trail for who submitted an answer.
- The server still stores the responder user id for permission enforcement and later export/reporting.

## Current UI

- Manager controls live in the existing live controls modal.
- Students see the active poll and recent history inside the live room side panel.
- The UI stays compact and follows existing light/dark mode styling.

## Future Improvements

- timed polls
- richer quiz scoring for multi-select correctness
- exportable poll history
- poll templates per class
- live result push without client refresh
- optional channel post-back of final poll results
