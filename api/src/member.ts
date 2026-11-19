import {
  bearerOf,
  type PluginMember,
  verifyErxesAccessToken,
  verifyPluginSession,
} from '@erxes/plugin-sdk';
import type express from 'express';
import { signedByCore } from '#/config.ts';
import { core } from '#/core.ts';
import { verifiedBy } from '#/modules/fail.ts';

/** How long an organisation's plan is trusted before core is asked again. */
const PLAN_MS = 60_000;

type Plan = Awaited<ReturnType<ReturnType<typeof core.forOrg>['saas']['pluginPlan']>>;

const plans = new Map<string, { plan: Promise<Plan>; until: number }>();

/** The plugin's plan in the organisation, asked of core at most once a minute. */
const planOf = async (orgId: string) => {
  const known = plans.get(orgId);

  if (known && known.until > Date.now()) return known.plan;

  const plan = core.forOrg(orgId).saas.pluginPlan({});

  plans.set(orgId, { plan, until: Date.now() + PLAN_MS });
  plan.catch(() => plans.delete(orgId));

  return plan;
};

/**
 * The member an access token from "Sign in with erxes" signs in (the desktop app). The token
 * carries no plan, so core is asked for it; an organisation the plugin is off in gets no one.
 */
const desktopMember = async (token: string): Promise<PluginMember> => {
  const signIn = await verifyErxesAccessToken(token, signedByCore);
  const { tier, access } = await planOf(signIn.orgId);

  if (access === 'off') throw new Error('the plugin is off in this organisation');

  return { ...signIn, tier, access, canChange: () => access !== 'read_only' };
};

/** A plugin session token from the plugin UI in web, or an access token from the desktop app. */
const memberFrom = async (token: string) => {
  try {
    return await verifyPluginSession(token, signedByCore);
  } catch {
    return desktopMember(token);
  }
};

/**
 * The member behind a request, or null once it is answered: 401 with `refused` without a valid
 * token, 503 while core is out of reach.
 */
export const memberOf = (req: express.Request, res: express.Response, refused: string) =>
  verifiedBy(res, 'member token', refused, async () => {
    const token = bearerOf(req.headers.authorization);

    if (!token) throw new Error('no token');

    return memberFrom(token);
  });
