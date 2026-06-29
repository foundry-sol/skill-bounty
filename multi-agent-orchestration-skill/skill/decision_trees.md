# Decision Trees for Multi-Agent Workflows

## "Should I use a task queue or just do the work myself?"

```
Is the work decomposable into independent subtasks?
│
├─ NO → Just do it yourself
│
└─ YES
   │
   ├─ Are there >1 specialized agent that could do it?
   │  │
   │  ├─ NO → Just do it yourself
   │  │
   │  └─ YES → Use TaskQueue
   │           Define tasks with requiredCapability
   │           Each agent claims work matching their capabilities
```

## "How should I combine agent outputs?"

```
How many agents are involved?
│
├─ 1 → Just use the output (no consensus needed)
│
├─ 2-3 with similar capability
│  └─ Use MAJORITY (50%+ agree = high confidence)
│
├─ 2-3 with different capabilities/credibility
│  └─ Use WEIGHTED (assign trust scores, high-weight wins)
│
└─ 4+ with diverse views
   │
   ├─ If you can rank agents by trust
   │  └─ Use WEIGHTED
   │
   └─ If all agents equally trustworthy
      └─ Use UNANIMOUS (all must agree to act)
         If no unanimity, escalate to human review
```

## "How should I split money among agents?"

```
What is the work pattern?
│
├─ Agents contributed different amounts of work
│  └─ Use CONTRIBUTION strategy (weighted by measurable work)
│
├─ Agents staked different capital
│  └─ Use STAKE strategy (skin-in-the-game weighted)
│
├─ Agents have different track records
│  └─ Use REPUTATION strategy (proven history weighted)
│
└─ All agents contributed equally
   └─ Use EQUAL (simple, transparent, no arguments)
```

## "What if agents disagree and consensus fails?"

```
Consensus returns null
│
├─ Can I retry with different agents?
│  └─ YES → Re-query with backup agents, use FIRST-VALID
│
├─ Is the decision time-sensitive?
│  │
│  ├─ YES → Use FIRST-VALID with primary agent
│  │         Accept lower confidence but act now
│  │
│  └─ NO → Wait, gather more data, retry
│
└─ Is this critical (large $ at risk, security issue)?
   └─ YES → Escalate to human operator
              Don't act on low-confidence consensus
```

## "Should I run the task in parallel or sequence?"

```
Are tasks independent of each other?
│
├─ NO (one depends on another)
│  └─ SEQUENCE: agent B can't start until agent A finishes
│
└─ YES (no dependencies)
   │
   ├─ Do I need all results before acting?
   │  └─ YES → PARALLEL with consensus at the end
   │
   └─ Can I act on first result?
      └─ PARALLEL with first-valid consensus
         (faster but lower confidence)
```