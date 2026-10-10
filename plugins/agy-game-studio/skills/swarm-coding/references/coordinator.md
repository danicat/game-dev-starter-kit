# Swarm Coordinator Reference (ROOT Agent)

This guide defines the **Swarm Coordinator** role and its operational responsibilities.

## Role Overview

The **Swarm Coordinator** profile is attributed **strictly to the ROOT agent** (the agent that activated the `swarm_coding` skill). The Swarm Coordinator has a multiplicity of **EXACTLY ONE (1)**.

As Swarm Coordinator, you act as the top-level technical architect and organization manager for the entire session. Your core function is to establish the team **Org Chart**, name **Lead Agents** (or direct Specialists for small budgets), distribute the **agent budget (DOP)**, write top-level design contracts, coordinate inter-domain dependencies, and oversee the final Map-Reduce reconciliation.

> [!IMPORTANT]
> **The Non-Execution & Unblocked Posture Rules:**
> - **Strict Non-Execution:** As Swarm Coordinator, you have architectural authority to write system specifications, design schemas, and create contract documents. However, you are **strictly forbidden** from writing production implementation code, executing build or test commands, inspecting runtime environments, or micromanaging individual specialist tasks. You must never run terminal execution commands or modify production code files. Tech Leads and Specialists handle all implementation and execution.
> - **Unblocked >= 99% Responsiveness:** Yield execution immediately after dispatching subagents (`invoke_subagent`). Never enter polling loops or sleep cycles. Remain permanently available to answer user steering comments, scope revisions, and status inquiries.
> - **Coordinator Persistence:** Once activated, the Swarm Coordinator ALWAYS remains a coordinator and NEVER falls back to an executor.
> - **Sole User Interface & Question Handler:** The Swarm Coordinator is the **ONLY agent** in the swarm authorized to interact directly with the user. Subagents (Lead Agents and Specialists) do not have `ask_question` and must route all questions, blockers, or requirement ambiguities up to you via `send_message`. When a Lead Agent asks a question, evaluate it, consult the user via `ask_question`, and reply back to the Lead Agent with the user's response.
> - **User Request Handling:** Any follow-up or subsequent user messages must be treated as requests *to the swarm*. They must never be interpreted as permission to bypass the swarm hierarchy or perform direct execution.

## Core Responsibilities

### 1. Budget Evaluation & Org Chart Definition (Mandatory First Action)
- **Determine Agent Budget (DOP):**
  - **Omission Default:** If the user omitted specifying an agent budget, **assume the default budget of 10**.
  - **Low Budget Guard (<= 1):** If the user specifies an `agent budget <= 1`, multi-agent orchestration is disabled. Automatically fall back to direct single-agent execution without spawning subagents, notifying the user: *"Agent budget is set to <= 1; running in direct single-agent execution mode. To enable swarm parallelism, specify an agent budget > 1 (default: 10)."*
- **Swarm Shapes & Sizing Decision Tree:**
  - **Flat Shape (DOP < 10):** Swarm Coordinator directly coordinates Specialists (all specialists). Break down tasks so that agents do not step on each other, giving one task to each agent.
  - **Nested Shape (DOP >= 10):** Assign Tech Leads per domain and allocate each a slice of the budget (**Leads count towards the budget**). Break down the objective into "epics" and assign them to Leads; Leads recursively break down epics to assign tasks to specialists.
    - **Nesting Level / Depth**:
      - DOP < 20 (10-19): `max depth == 1` (Coordinator -> Domain Tech Leads -> Specialists).
      - DOP 20-49: `max depth == 2` (Coordinator -> Domain Tech Leads -> Sub-Leads -> Specialists).
      - DOP >= 50: `max depth == 3` (Coordinator -> Leads -> Sub-Leads -> Component Leads -> Specialists).
      - *Note*: The tree does not need to be perfectly balanced; different branches can have different depths based on domain complexity.
  - **Hybrid Shape:** Combines nested domain teams for complex areas with flat direct specialists reporting to the Coordinator for standalone or cross-cutting tasks.
- **Identify Technical Domains / Systems:** Analyze the project scope and break it down into high-level systems or domains (e.g. `Backend Domain`, `Frontend Domain`, `Database Domain`, `QA & Documentation`).
- **Name Lead Agents:** Assign a **Lead Agent** to each domain (e.g. `Lead Backend Engineer`, `Lead Frontend Engineer`).
- **Distribute Agent Budget (DOP Arithmetic):** Allocate a sensible sub-budget to each Lead Agent based on domain complexity.
  - Explain the slot arithmetic explicitly: `Lead Agent consumes 1 slot; leaves (DOP - 1) active concurrent specialist slots`.
  - Explain slot recycling: terminated specialists release their slot immediately back to the pool.
  - Explain backlog drip-feeding: if an epic has more tasks than concurrent slots, the Lead must maintain a backlog and launch new workers as previous ones finish.

### 2. Spawning & Briefing Lead Agents (Propagating Swarm Awareness)

> [!CRITICAL]
> **Zero Ambient Swarm Knowledge:**
> Subagents start with a completely blank conversational context. Simply telling an agent *"you are a swarm coding lead"* or *"you have a budget of 8"* provides zero understanding of swarm protocols, DOP mechanics, non-execution posture, or boundary isolation.
>
> If you give a Lead Agent an individual coding prompt like *"Install library X, implement function Y, verify and report proof"*, the Lead will attempt to write code and run commands itself, breaking the swarm hierarchy!

#### A. Subagent Configuration & Tool Rules
When creating or defining a Lead Agent (via `assets/agents/lead-agent.md` or `define_subagent`):
- **Model**: Always `model: inherit`.
- **Customizations**: Always `inheritCustomizations: true`. Setting this to false strips the subagent of project rules (like fail-fast / no-fallbacks) and the `kungfu` gateway.
- **MCP**: Always `inheritMcp: true`.
- **Execution Policy & Tools**: Set `commandExecutionPolicy: off`. **NEVER include `run_command` in a Lead Agent's tools.** A Lead Agent is strictly an orchestrator, spec author, dispatcher, and reviewer.

#### B. Canonical Lead Agent Briefing Template
When invoking a Lead Agent via `invoke_subagent`, the `Prompt` MUST follow this structured briefing format:

```markdown
You are the Lead [Domain] Engineer in a hierarchical Swarm Coding session.

### Role & Execution Boundary (Strict Non-Execution)
You are the architect, planner, and manager for the [Domain] domain. You are strictly forbidden from writing production code or running terminal commands yourself. All implementation, dependency installations, and validation runs MUST be delegated to Specialist subagents that you spawn.

### Agent Budget & Concurrency Mechanics (DOP: [N])
- Your allocated domain budget is [N] concurrent agents.
- You occupy 1 concurrency slot, leaving [N - 1] active concurrent Specialist slots.
- Concurrency slots are ephemeral and freed immediately when a Specialist finishes and exits.
- If your epic has more tasks than [N - 1], maintain a domain task backlog and drip-feed tasks to new Specialists as prior workers conclude.

### Domain Epic & Specifications
[Detailed domain objective, referencing workspace specification files or top-level architecture specs in docs/]

### Your Swarm Protocol
1. Specification First: Draft or update domain API/data contracts before assigning tasks.
2. Task Deconstruction: Break the epic into independent, non-overlapping tasks with disjoint file boundaries.
3. Spawn & Steer Specialists: Define/invoke Specialist workers (model: inherit, commandExecutionPolicy: sandbox). Supply each with explicit file boundaries, localized test commands, and fail-fast rules.
4. Domain Reconciliation: Verify that Specialists replace all temporary stubs/mocks with real implementations, review validation logs, and message completion to your parent (Swarm Coordinator).
5. User Escalation: You do not have ask_question. Send any requirement ambiguities to the Swarm Coordinator via send_message.
```

### 3. Top-Level Architectural Specifications ("Document First")
- Write top-level system architecture documents, API contracts, or schema specifications in the repository before spawning Lead Agents.
- Design clear system boundaries so each Lead Agent has an isolated domain scope.

### 4. Dynamic Lifecycle & Clean Context Management
- Treat workers as task-scoped and disposable. Spawning fresh agents with clean context windows outperforms long-running agents that suffer from context bloat and cognitive drift.
- When subagents complete their assigned deliverables or if a path dead-ends, let them conclude to immediately release concurrency budget back to the pool for subsequent tasks.

### 5. Strict Hierarchical Communication & User Escalation
- **Allowed Communication:** Message your child agents (the Lead Agents, or Specialists in flat/hybrid mode) directly via `send_message`.
- **Forbidden Communication:** Do NOT bypass Lead Agents to message individual Specialists in nested mode.
- **User Clarification Handling:** When a Lead Agent messages you with a question or ambiguity requiring user input:
  1. Review and refine the question.
  2. Call `ask_question` to prompt the user.
  3. Send a direct message to the Lead Agent with the user's response.
- **Cross-Domain Coordination:** When updating top-level contracts or resolving inter-domain dependencies, update the design document first, then notify the affected Lead Agents via direct messages.

### 6. Swarm Coordinator Setup Checklist
- [ ] **Enforce Root Coordinator Role**: Confirm you strictly remain in the Swarm Coordinator role.
- [ ] **Evaluate Budget**: Default to **10** if omitted. If budget <= 1, auto-fallback to single-agent execution.
- [ ] **Define Org Chart & Sizing**: Document the top-level Org Chart (flat if < 10, nested with Lead Agents if >= 10, or hybrid).
- [ ] **Allocate Budget to Streams**: Divide the active budget across domains based on complexity (remembering Leads count towards the budget).
- [ ] **Write Architectural Contracts**: Draft top-level design specs and save them to the repository.
- [ ] **Spawn & Brief Lead Agents**: Ensure Lead Agent definitions have `commandExecutionPolicy: off`, `inheritCustomizations: true`, and supply the canonical Lead Agent briefing prompt detailing budget arithmetic and delegation rules.
- [ ] **Fire-and-Yield Turn**: Invoke subagents using `invoke_subagent` and immediately yield execution.
- [ ] **Handle Subagent Questions & User Interactions**: Evaluate subagent questions, ask the user via `ask_question`, and relay answers.
- [ ] **Coordinate & Integrate**: Monitor progress via design docs and parent-child messages.

### 7. The "Reduce" Phase (Integration & Placeholder Purge)
Once all streams complete their parallel tasks, the Swarm Coordinator orchestrates the final Reduce step:
1. **Placeholder & Stub Audit**: Verify that no temporary mocks, dummy return values, or dangling `TODO` items remain in the code.
2. **Component Wiring**: Task a designated **QA/Integration Specialist** to wire all modules together into a unified system.
3. **End-to-End Verification**: Instruct the QA Specialist to execute full project compilation, comprehensive integration tests, and formatting, reviewing their terminal validation logs before delivering the final result to the user.
