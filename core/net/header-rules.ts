import { log } from '../../shared/logger';

/**
 * Simple HeaderRuleManager — creates declarativeNetRequest session rules
 * to attach Referer/Origin to requests from extension pages.
 * ponytail: full impl with per-domain scoping in T3.3
 */

// Rule IDs: allocate from a base to avoid collisions
let nextRuleId = 10_000;
const taskRuleIds = new Map<string, number[]>();

export interface HeaderConfig {
  Referer?: string;
  Origin?: string;
  'User-Agent'?: string;
}

/**
 * Create session rules that set headers for requests to given domains,
 * initiated from the extension.
 */
export async function applyHeaders(
  taskId: string,
  urlFilterDomains: string[],
  headers: HeaderConfig,
): Promise<void> {
  if (urlFilterDomains.length === 0) return;

  const ruleIds: number[] = [];
  const addRules: Browser.declarativeNetRequest.Rule[] = [];

  for (const domain of urlFilterDomains) {
    const ruleId = nextRuleId++;
    ruleIds.push(ruleId);

    const requestHeaders: Browser.declarativeNetRequest.ModifyHeaderInfo[] = [];
    for (const [name, value] of Object.entries(headers)) {
      if (value) {
        requestHeaders.push({
          header: name,
          operation: 'set',
          value,
        });
      }
    }

    if (requestHeaders.length === 0) continue;

    addRules.push({
      id: ruleId,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders,
      },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ['xmlhttprequest', 'media', 'other'],
        initiatorDomains: [browser.runtime.id],
      },
    });
  }

  if (addRules.length > 0) {
    await browser.declarativeNetRequest.updateSessionRules({ addRules });
    taskRuleIds.set(taskId, ruleIds);
    log.debug('Applied header rules for task', taskId, ruleIds);
  }
}

/**
 * Remove session rules for a given task.
 */
export async function removeHeaders(taskId: string): Promise<void> {
  const ids = taskRuleIds.get(taskId);
  if (!ids?.length) return;

  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: ids,
  });
  taskRuleIds.delete(taskId);
  log.debug('Removed header rules for task', taskId, ids);
}
