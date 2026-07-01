import { mergedEnv } from './env-utils.mjs';

const WORKFLOW_NAME = 'Salu WhatsApp - Dashboard Manual Send';
const WEBHOOK_PATH = 'salu-dashboard-send';
const DEFAULT_PHONE_NUMBER_ID = '1175796395607450';

function request(baseUrl, apiKey, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'X-N8N-API-KEY': apiKey,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      throw new Error(
        `${options.method || 'GET'} ${path} failed with ${response.status}: ${
          typeof body === 'string' ? body : JSON.stringify(body)
        }`,
      );
    }
    return body;
  });
}

async function listWorkflows(baseUrl, apiKey) {
  const workflows = [];
  let cursor = '';
  do {
    const body = await request(
      baseUrl,
      apiKey,
      `/api/v1/workflows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    workflows.push(...(body.data || []));
    cursor = body.nextCursor || '';
  } while (cursor);
  return workflows;
}

async function listCredentials(baseUrl, apiKey) {
  const credentials = [];
  let cursor = '';
  do {
    const body = await request(
      baseUrl,
      apiKey,
      `/api/v1/credentials?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    credentials.push(...(body.data || []));
    cursor = body.nextCursor || '';
  } while (cursor);
  return credentials;
}

async function ensureDashboardWebhookCredential(baseUrl, apiKey, credentials, webhookSecret) {
  const existing = credentials.find(
    (credential) =>
      credential.type === 'httpHeaderAuth' &&
      credential.name === 'Salu Dashboard Manual Send Secret',
  );
  if (existing) return existing;

  const credential = await request(baseUrl, apiKey, '/api/v1/credentials', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Salu Dashboard Manual Send Secret',
      type: 'httpHeaderAuth',
      data: {
        name: 'X-Salu-Webhook-Secret',
        value: webhookSecret,
        allowedHttpRequestDomains: 'none',
      },
    }),
  });
  credentials.push(credential);
  return credential;
}

function workflowJson(metaCredential, webhookCredential, phoneNumberId) {
  return {
    name: WORKFLOW_NAME,
    nodes: [
      {
        id: '9c70f61a-1000-4b66-8d45-4a8af8e6a101',
        name: 'Dashboard Manual Send Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [-620, 0],
        parameters: {
          httpMethod: 'POST',
          path: WEBHOOK_PATH,
          authentication: 'headerAuth',
          responseMode: 'responseNode',
        },
        credentials: {
          httpHeaderAuth: {
            id: webhookCredential.id,
            name: webhookCredential.name,
          },
        },
        webhookId: 'c9a021bb-9b2e-4e95-b8fa-7d419ec9df8e',
      },
      {
        id: '9c70f61a-1000-4b66-8d45-4a8af8e6a102',
        name: 'Prepare Manual Send',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-360, 0],
        parameters: {
          mode: 'runOnceForAllItems',
          language: 'javaScript',
          jsCode: `function waTo(value) {
  return String(value || '').replace(/[^\\d]/g, '');
}
function clean(value) {
  return String(value || '').trim();
}
const input = $input.first().json || {};
const body = input.body && typeof input.body === 'object' ? input.body : input;
const to = waTo(body.to || body.phone || body.wa_to);
const text = clean(body.text || body.content_text || body.message);
if (!to) throw new Error('phone is required');
if (!text) throw new Error('text is required');
const payload = {
  messaging_product: 'whatsapp',
  to,
  type: 'text',
  text: { body: text },
};
const contextMessageId = clean(body.context_message_id || body.contextMessageId);
if (contextMessageId) payload.context = { message_id: contextMessageId };
return [{ json: { payload } }];`,
        },
      },
      {
        id: '9c70f61a-1000-4b66-8d45-4a8af8e6a103',
        name: 'Send WhatsApp Payload',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.4,
        position: [-80, 0],
        parameters: {
          method: 'POST',
          url: `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          sendHeaders: true,
          specifyHeaders: 'keypair',
          headerParameters: {
            parameters: [{ name: 'Content-Type', value: 'application/json' }],
          },
          sendBody: true,
          contentType: 'json',
          specifyBody: 'json',
          jsonBody: '={{ $json.payload }}',
          options: {
            timeout: 30000,
            response: { response: { responseFormat: 'json', neverError: false } },
          },
        },
        credentials: {
          httpHeaderAuth: {
            id: metaCredential.id,
            name: metaCredential.name,
          },
        },
      },
      {
        id: '9c70f61a-1000-4b66-8d45-4a8af8e6a104',
        name: 'Respond Success',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.5,
        position: [200, 0],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ $json }}',
          options: { responseCode: 200 },
        },
      },
    ],
    connections: {
      'Dashboard Manual Send Webhook': {
        main: [[{ node: 'Prepare Manual Send', type: 'main', index: 0 }]],
      },
      'Prepare Manual Send': {
        main: [[{ node: 'Send WhatsApp Payload', type: 'main', index: 0 }]],
      },
      'Send WhatsApp Payload': {
        main: [[{ node: 'Respond Success', type: 'main', index: 0 }]],
      },
    },
    settings: {
      executionOrder: 'v1',
      timezone: 'Asia/Kolkata',
      saveExecutionProgress: true,
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner',
    },
  };
}

const env = mergedEnv();
const baseUrl = String(env.N8N_URL || '').replace(/\/$/, '');
const apiKey = env.N8N_API_KEY || '';
const webhookSecret = env.SALU_N8N_MANUAL_SEND_TOKEN || '';
const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_PHONE_NUMBER_ID;
if (!baseUrl || !apiKey) throw new Error('Missing N8N_URL or N8N_API_KEY');
if (!webhookSecret || webhookSecret.length < 32) {
  throw new Error('SALU_N8N_MANUAL_SEND_TOKEN is required and must contain at least 32 characters');
}

const credentials = await listCredentials(baseUrl, apiKey);
const metaCredential = credentials.find(
  (credential) =>
    credential.type === 'httpHeaderAuth' &&
    credential.name === 'Meta WhatsApp Bearer Token',
);
if (!metaCredential) {
  throw new Error('Missing n8n credential: Meta WhatsApp Bearer Token');
}
const webhookCredential = await ensureDashboardWebhookCredential(
  baseUrl,
  apiKey,
  credentials,
  webhookSecret,
);

const workflows = await listWorkflows(baseUrl, apiKey);
const existing = workflows.find((workflow) => workflow.name === WORKFLOW_NAME);
const payload = workflowJson(metaCredential, webhookCredential, phoneNumberId);
let workflow;

if (existing) {
  const current = await request(baseUrl, apiKey, `/api/v1/workflows/${existing.id}`);
  workflow = await request(baseUrl, apiKey, `/api/v1/workflows/${existing.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, staticData: current.staticData || null }),
  });
} else {
  workflow = await request(baseUrl, apiKey, '/api/v1/workflows', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

if (!workflow.active) {
  await request(baseUrl, apiKey, `/api/v1/workflows/${workflow.id}/activate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  workflow.active = true;
}

console.log(
  JSON.stringify({
    id: workflow.id,
    name: WORKFLOW_NAME,
    active: workflow.active,
    webhookUrl: `${baseUrl}/webhook/${WEBHOOK_PATH}`,
  }),
);
