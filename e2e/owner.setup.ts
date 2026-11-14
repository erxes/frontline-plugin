import { test as setup } from '@playwright/test';
import { coreClient, OWNER, OWNER_STATE } from './fixtures.ts';

// First-run setup on the fresh database, through the endpoint web's setup screen calls.
// Core installs every registered plugin in a new organisation.
setup('the owner creates the organisation', async ({ request, baseURL }) => {
  const api = coreClient(request, baseURL);

  const { required } = await api.auth.setupStatus();

  if (required) await api.auth.setup(OWNER);
  else await api.auth.signIn({ email: OWNER.email, password: OWNER.password });

  await api.auth.onboarded({ language: 'en' });
  await request.storageState({ path: OWNER_STATE });
});
