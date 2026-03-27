import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCreateAgentPrompt(server: McpServer): void {
  server.registerPrompt(
    "create-agent",
    {
      description: "Guide to create a custom AI agent with rules, skills, MCP servers, and multi-stage execution",
      argsSchema: {
        agent_name: z.string().describe("Name for the custom agent"),
        task_description: z.string().describe("What the agent should do"),
        org_id: z.string().describe("Organization identifier").optional(),
        project_id: z.string().describe("Project identifier").optional(),
      },
    },
    async ({ agent_name, task_description, org_id, project_id }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Create a custom AI agent pipeline for:

**Agent Name**: ${agent_name}
**Task**: ${task_description}
**Scope**: ${org_id ? `Org: ${org_id}` : "Account-level"}${project_id ? `, Project: ${project_id}` : ""}

> **This is INTERACTIVE — show YAML for review and wait for confirmation before creating the agent.**

---

## Phase 1: Check Existing Solutions First

**IMPORTANT: Before creating a new agent, check if an existing one can solve the use case.**

1. **List existing agents** — Call \`harness_list\` with \`resource_type="agent"\`${org_id ? ` and \`org_id="${org_id}"\`` : ""}${project_id ? ` and \`project_id="${project_id}"\`` : ""}
   - Check if any system or custom agents already exist that can handle this task
   - Ask user if they want to use/modify an existing agent instead of creating new

2. **Refer to agent-pipeline schema when needed** — If you're not sure about the YAML structure, use \`harness_schema(resource_type="agent-pipeline")\` to explore available sections
   - **CRITICAL**: Always use first-class \`agent\` spec format, NOT \`pipeline\` format

---

## Phase 2: Requirements Gathering (Ask User)

If creating a new agent, collect the following before generating YAML:

1. **Task details** — goal, inputs/outputs, constraints
   - Main task goes in \`task\` field as detailed step-by-step instructions
   - User preferences and constraints go in \`rules\` field as bullet points
   - Example rules: "Use idiomatic Go code", "Focus on security first", "Do not modify existing tests"

2. **Remote MCP servers** (HTTPS only — local/stdio MCPs are NOT supported)
   | Use Case | Recommended MCP | Auth |
   |---|---|---|
   | Code / PRs | \`https://api.githubcopilot.com/mcp/\` | \`Bearer <+secrets.getValue("github_pat")>\` |
   | Harness platform | \`https://<your-harness-mcp-url>/mcp\` | Bearer token |
   | Notifications | \`https://<your-slack-mcp-url>/mcp\` | Bearer token |

3. **Container image**
   - Default: \`pkg.harness.io/vrvdt5ius7uwygso8s0bia/harness-agents/<plugin-name>:main\`
   - Connector: \`account.harnessImage\`
   - Ask if user has a custom image: \`pkg.harness.io/<org>/<repo>/<image>:<tag>\`

4. **MCP tool access** — wildcards or specific tools?
   - All tools: \`mcp__harness__*,mcp__github__*\`
   - Specific: \`mcp__github__create_pr,mcp__github__list_files\`

5. **Model config** — Bedrock model ARN and region (default: \`us-east-1\`)

6. **Runtime inputs (optional)** — Ask user if the agent needs runtime inputs
   - Only add \`inputs\` section if user confirms it's needed
   - Common inputs: \`repo\` (string), \`llmKey\` (secret), \`executionId\` (string), \`branch\` (string)
   - These must be provided when executing the agent via \`harness_execute\` with \`inputs_yaml\` parameter
   - Format: \`inputs_yaml: "repo: org/repo\\nllmKey: xxx\\nexecutionId: 123"\`

---

## Phase 3: Generate Agent YAML

Use this structure. Apply AWS Bedrock env defaults, linux/arm64 platform, and structure the agent spec as follows:
- **task**: Detailed step-by-step instructions for what the agent should do
- **rules**: User preferences and constraints as bullet points
- **inputs**: (Optional) Runtime parameters if user confirms they're needed

**Note on inputs**: Only include the \`inputs\` section if user confirms they need runtime parameters. Inputs are passed via \`inputs_yaml\` when executing the agent.

**Referencing inputs**: Use \`<+inputs.fieldName>\` syntax to reference runtime inputs in task description or env vars.
Example: \`Execute analysis on <+inputs.executionId>\` or \`API_KEY: <+inputs.llmKey>\`

### Working Example (for your reference): Code Coverage & Review Agent

\`\`\`yaml
version: 1
agent:
  clone:
    depth: 1000
    ref:
      type: branch
      name: main
    repo: <username>/<repo-name>
    connector: <connector_github_id>
  stages:
    - name: Coverage and Review
      id: coverage_and_review
      platform:
        os: linux
        arch: arm64
      steps:
        - id: run_code_coverage_agent
          name: Run Code Coverage Agent
          agent:
            container:
              connector: account.harnessImage
              image: pkg.harness.io/vrvdt5ius7uwygso8s0bia/harness-agents/claude-code-plugin:main
            env:
              ANTHROPIC_MODEL: <model-arn-profile>
              AWS_BEARER_TOKEN_BEDROCK: <+secrets.getValue("bedrock_api_key")>
              AWS_REGION: us-east-1
              CLAUDE_CODE_USE_BEDROCK: "1"
            task: |
              You are a code coverage agent. The repository has already been cloned into the current working directory. It is a Go project. If go is not installed then install the latest version of go.
              1. Measure the current test coverage. Parse the output to determine overall and per-file coverage percentages.
              2. Identify all Go packages and source files below 80% coverage (or with no tests).
              3. Generate comprehensive unit tests to bring overall coverage to ≥80%:
                - Write idiomatic Go test functions in *_test.go files in the same package.
                - Cover all exported functions, edge cases, error paths, and boundary conditions.
                - Use table-driven tests where appropriate.
                - Do not delete or modify existing tests.
              4. Re-run coverage to confirm ≥80%. If not, continue adding tests.
              5. Generate COVERAGE.md (under 10000 chars) with: overall before/after, per-file summary table, key improvements.
              6. Use GitHub MCP tools to:
                a. Create branch "code-coverage-agent-<unique-suffix>" from current branch.
                b. Commit all new/modified test files and COVERAGE.md.
                c. Open a PR titled "Code Coverage: Automated coverage increase by Harness AI".
                d. Post COVERAGE.md contents as a PR comment under "## Code Coverage Report".
              7. Write INFO.md with PR url, repo, branch, and PR number.
            max_turns: 150
            rules:                       # User preferences and constraints
              - Use idiomatic Go code with table-driven tests
              - Do not modify or delete existing tests
              - Keep COVERAGE.md under 10000 characters
            mcp_servers:
              harness:
                url: https://<your-ngrok-url>/mcp
              github:
                url: https://api.githubcopilot.com/mcp/
                headers:
                  Authorization: Bearer <+secrets.getValue("github_pat")>
            with:
              allowed_tools: mcp__harness__*,mcp__github__*
              log_file: .agent/output/mcp-test-log.jsonl

        - id: run_code_review_agent
          name: Run Code Review Agent
          agent:
            container:
              connector: account.harnessImage
              image: pkg.harness.io/vrvdt5ius7uwygso8s0bia/harness-agents/claude-code-plugin:main
            env:
              ANTHROPIC_MODEL: <model-arn-profile>
              AWS_BEARER_TOKEN_BEDROCK: <+secrets.getValue("bedrock_api_key")>
              AWS_REGION: us-east-1
              CLAUDE_CODE_USE_BEDROCK: "1"
            task: |
              Read PR url and info from INFO.md in the current directory.
              You are a code review agent. Review the pull request by:
              1. Analyzing all changed files for correctness, code quality, security issues, performance, and best practices.
              2. Posting inline review comments via GitHub MCP tools for any issues or suggestions.
              3. Posting a final summary comment with: key issues found, suggestions made, and overall verdict (Approve / Request Changes).
            max_turns: 150
            rules:                       # User preferences and constraints
              - Focus on security vulnerabilities first
              - Check test coverage for new code
              - Provide constructive feedback only
            mcp_servers:
              harness:
                url: https://<your-ngrok-url>/mcp
              github:
                url: https://api.githubcopilot.com/mcp/
                headers:
                  Authorization: Bearer <+secrets.getValue("github_pat")>
            with:
              allowed_tools: mcp__harness__*,mcp__github__*
              log_file: .agent/output/mcp-test-log.jsonl
  inputs:                          # Optional: Runtime inputs passed via harness_execute
    executionId:
      type: string
      description: Pipeline execution ID to analyze
    llmKey:
      type: secret
      description: LLM API key for the agent
\`\`\`

---

## Phase 4: Present for Review

Before creating, show the user:
- Complete YAML with all placeholders marked (e.g. \`<model-arn-profile>\`, \`<connector_github_id>\`)
- Secrets that must be created in Harness UI (e.g. \`bedrock_api_key\`, \`github_pat\`)
- Any connector requirements

**Wait for explicit user confirmation before proceeding.**

---

## Phase 5: Create Agent
Only after confirmation, use \`harness_create\` to create the agent.
Note: \`uid\` is auto-generated from \`name\` if omitted (e.g. "My Agent" → "my_agent")

### Executing the Agent (if inputs were defined)
If the agent has an \`inputs\` section, execute it with:
\`\`\`
harness_execute(
  resource_type="agent",
  action="run",
  agent_id="<agent_uid>",
  inputs_yaml="executionId: abc123\\nllmKey: xxx\\nrepo: org/repo"
)
\`\`\`

---

## Important Notes

| Topic | Rule |
|---|---|
| **Check existing first** | Always call \`harness_list(resource_type="agent")\` to see if an existing agent can solve the use case before creating new |
| **Use schema tool** | If unsure about YAML structure, use \`harness_schema(resource_type="agent-pipeline")\` — always use first-class \`agent\` format, NOT \`pipeline\` |
| MCP servers | HTTPS remote endpoints only — no local/stdio MCPs |
| MCP tools | Only MCP tools supported in \`allowed_tools\` — no built-in tools |
| Rules | User preferences and constraints go in \`rules\` field as bullet points (e.g. "Use idiomatic Go", "Focus on security") |
| Task description | Main instructions in \`task\` field — detailed, step-by-step |
| Secrets | Reference as \`<+secrets.getValue("key")>\` — user must create in Harness UI |
| Platform | Default: \`os: linux, arch: arm64\` |
| Bedrock env | Always include \`AWS_BEARER_TOKEN_BEDROCK\`, \`AWS_REGION\`, \`CLAUDE_CODE_USE_BEDROCK: "1"\`, \`ANTHROPIC_MODEL\` |
| Logging | \`with.log_file: .agent/output/log.jsonl\` |
| Multi-step | Steps run sequentially — pass state between steps via files (e.g. INFO.md) |
| **Runtime inputs** | Only add \`inputs\` section if user confirms it's needed — these must be passed via \`inputs_yaml\` when executing with \`harness_execute\` |`
        }
      }]
    })
  );
}