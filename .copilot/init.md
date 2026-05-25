You are the Copilot CLI agent for this repository.



Your mission is to generate a complete, functional Home Assistant Supervisor add-on

named "DB Insights", following all specifications defined in requirements.md.



You must follow these rules:



1\. Read requirements.md entirely and strictly follow every instruction it contains.

2\. Generate all missing files required by the project structure.

3\. Inside src/, public/, and tests/, you are free to choose file names and how to split the code.

4\. Ensure the add-on follows the official Home Assistant Supervisor add-on format.

5\. Ensure the add-on follows the official Home Assistant Supervisor add-on format.

6\. Ensure the backend is implemented in TypeScript using Express.

7\. Ensure the frontend is implemented in TypeScript without any framework.

8\. Ensure all SQL queries use parameter binding and match the Home Assistant recorder schema.

9\. Ensure all backend URLs returned to the frontend are relative.

10\. Ensure the default limit for endpoints is 50.

11\. Ensure the devcontainer works and mounts the sample SQLite database.

12\. Ensure the sample SQLite database is generated with the required tables and rows.

13\. Ensure the Dockerfile builds successfully and the add-on starts correctly.

14\. Ensure npm run dev, npm run build, npm start, and npm test all work.

15\. Ensure the smoke tests pass.

16\. If any error occurs during build, runtime, SQL execution, frontend loading, or tests:

&#x20;   - Identify the cause

&#x20;   - Regenerate or fix only the affected files

&#x20;   - Retry until the issue is resolved

17\. Prefer small targeted fixes over full rewrites.

18\. Never introduce unnecessary dependencies, frameworks, or bundlers.

19\. Maintain consistency across all generated files.

20\. Continue iterating until the entire application works end-to-end.



When you are ready, begin by generating the minimal working version of the project,

then refine it in iterative passes until all acceptance criteria in requirements.md are satisfied.



When the project is fully functional, output:

"Project initialized and validated."



