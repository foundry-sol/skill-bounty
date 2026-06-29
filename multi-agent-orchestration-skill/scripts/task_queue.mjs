#!/usr/bin/env node
/**
 * Task queue for multi-agent Solana workflows.
 *
 * Agents register, claim tasks based on capability, complete them, and
 * the orchestrator tracks status. Built for autonomous agent coordination
 * where many small tasks need to be done by different specialized agents.
 *
 * Exit codes: 0=ok, 1=error
 */
import crypto from 'node:crypto';

export class TaskQueue {
  constructor() {
    this.tasks = new Map();
    this.agents = new Map();
    this.results = new Map();
  }

  registerAgent(agentId, capabilities = []) {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} already registered`);
    }
    this.agents.set(agentId, {
      id: agentId,
      capabilities: new Set(capabilities),
      status: 'idle',
      tasksCompleted: 0,
      tasksFailed: 0,
    });
    return agentId;
  }

  enqueue(task) {
    if (!task.id) task.id = crypto.randomBytes(8).toString('hex');
    if (!task.requiredCapability) {
      throw new Error('Task requires `requiredCapability`');
    }
    if (!task.priority) task.priority = 0;
    task.status = 'pending';
    task.createdAt = Date.now();
    this.tasks.set(task.id, task);
    return task.id;
  }

  /**
   * Find best agent for a task. Strategy:
   *   1. Agent must be idle
   *   2. Agent must have the required capability
   *   3. Prefer agents with lowest task count (load balancing)
   */
  findBestAgent(task) {
    let best = null;
    let bestLoad = Infinity;
    for (const agent of this.agents.values()) {
      if (agent.status !== 'idle') continue;
      if (!agent.capabilities.has(task.requiredCapability)) continue;
      const load = agent.tasksCompleted + agent.tasksFailed;
      if (load < bestLoad) {
        best = agent;
        bestLoad = load;
      }
    }
    return best ? best.id : null;
  }

  /**
   * Claim the next available task for a given agent.
   * Returns the task or null if nothing available.
   */
  claimNext(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent ${agentId}`);

    const pending = Array.from(this.tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

    for (const task of pending) {
      if (agent.capabilities.has(task.requiredCapability)) {
        const assignee = this.findBestAgent(task);
        if (assignee === agentId) {
          task.status = 'in_progress';
          task.assignee = agentId;
          task.startedAt = Date.now();
          agent.status = 'busy';
          return task;
        }
      }
    }
    return null;
  }

  complete(taskId, agentId, result) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task ${taskId}`);
    if (task.assignee !== agentId) {
      throw new Error(`Task ${taskId} not assigned to ${agentId}`);
    }
    task.status = 'completed';
    task.completedAt = Date.now();
    this.results.set(taskId, result);
    const agent = this.agents.get(agentId);
    agent.status = 'idle';
    agent.tasksCompleted++;
    return task;
  }

  fail(taskId, agentId, error) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task ${taskId}`);
    if (task.assignee !== agentId) {
      throw new Error(`Task ${taskId} not assigned to ${agentId}`);
    }
    task.status = 'failed';
    task.error = error;
    const agent = this.agents.get(agentId);
    agent.status = 'idle';
    agent.tasksFailed++;
    return task;
  }

  status() {
    return {
      agents: Array.from(this.agents.values()),
      tasks: {
        total: this.tasks.size,
        pending: Array.from(this.tasks.values()).filter(t => t.status === 'pending').length,
        inProgress: Array.from(this.tasks.values()).filter(t => t.status === 'in_progress').length,
        completed: Array.from(this.tasks.values()).filter(t => t.status === 'completed').length,
        failed: Array.from(this.tasks.values()).filter(t => t.status === 'failed').length,
      },
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = new TaskQueue();
  q.registerAgent('trader', ['swap', 'analyze']);
  q.registerAgent('auditor', ['audit', 'verify']);
  q.registerAgent('scout', ['scan', 'monitor']);

  q.enqueue({ id: 't1', requiredCapability: 'swap', payload: { from: 'USDC', to: 'SOL', amount: 100 } });
  q.enqueue({ id: 't2', requiredCapability: 'audit', payload: { contract: 'Tokenk...', severity: 'medium' } });
  q.enqueue({ id: 't3', requiredCapability: 'scan', payload: { query: 'top volume' } });

  console.log('Initial status:', q.status());

  const t1 = q.claimNext('trader');
  console.log(`Trader claimed: ${t1.id}`);
  q.complete('t1', 'trader', { tx: 'mock-sig', out: 1.5 });

  const t2 = q.claimNext('auditor');
  console.log(`Auditor claimed: ${t2.id}`);
  q.complete('t2', 'auditor', { finding: 'uninitialized-state' });

  const t3 = q.claimNext('scout');
  console.log(`Scout claimed: ${t3.id}`);
  q.complete('t3', 'scout', { results: ['jupiter', 'raydium'] });

  console.log('Final status:', q.status());
}