# Developer - Team Workflow Guide

## Your Workflow
- Check `Management/Developers/Adam/tasks.md` or `Management/Developers/Brian/tasks.md` for assignments
- look for `in-progress` tasks first then `pending` tasks, for picking up in your `Developers/<your-name>/tasks.md`
- if a task is blocked by another non-completed task, task status can be checked in your `Developers/<your-name>/tasks.md` or `Developers/Brian/tasks.md` or the `Tasks/TASK-XXX.md` file
- Update task status as you progress
- Document questions or change in plans etc in `feedback.md`

## Task Management
1. Review assigned tasks in your `tasks.md` file
2. Update status: `pending` → `in-progress` → `completed`
3. Ask questions by adding to your `feedback.md`
4. Follow task requirements in `Tasks/TASK-XXX.md`

## Getting Help
- Add technical questions to your `feedback.md`
- Reference specific files and line numbers
- Describe what you've tried and what's blocking you
- Senior developer will respond in your feedback file

## Documentation Standards & Verification (Added 2025-06-24)

### Evidence-Based Reporting Requirements
When documenting accomplishments, you MUST provide:

1. **Code Changes**: Specific file names and line counts
   - Before/after line counts: `wc -l filename.ts`
   - Git diffs showing actual changes made
   - File creation/deletion evidence

2. **Verifiable Metrics**: No estimates without evidence
   - Use `find src/ -name "*.ts" -exec wc -l {} + | tail -1` for total line counts
   - Use `git log --oneline --since="date" --name-only` for change history
   - Screenshot outputs for claimed metrics

3. **Functionality Claims**: Testable evidence required
   - Test results showing features work
   - Build success/failure evidence
   - Performance measurements if claiming improvements

### Prohibited Documentation Practices
- ❌ **No unverifiable estimates**: "estimated 70% reduction"
- ❌ **No speculation as fact**: "removed monitoring services" without evidence
- ❌ **No planning concepts as completed work**: "consolidated 12 processors"
- ❌ **No aspirational targets as achievements**: "massive code reduction"

### Required Verification Process
Before documenting major accomplishments:

1. **Self-Verification**: Verify your own claims with evidence
2. **Evidence Collection**: Gather screenshots, diffs, test results
3. **Conservative Reporting**: Understate rather than overstate achievements
4. **Peer Review**: Have another developer verify significant claims

### Documentation Review Checklist
- [ ] All metrics supported by verifiable evidence
- [ ] No exaggerated language ("massive", "huge", "revolutionary")
- [ ] Specific file names and line counts provided
- [ ] Test results or build evidence included
- [ ] Claims can be independently verified by another developer

## Files You Update
- `Developers/Adam/tasks.md` or `Developers/Brian/tasks.md` - Your task status updates
- `Developers/Adam/feedback.md` or `Developers/Brian/feedback.md` - Questions and blockers  
- Code files as assigned in tasks

## Communication
- Keep feedback.md updated with progress notes
- Be specific about blockers and questions

Always commit your work and only your work.
