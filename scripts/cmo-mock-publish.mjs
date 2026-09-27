/**
 * Mock publish only. Uses @opencoredev/social-sdk mockBackend.
 * Does not import a live platform adapter and does not post.
 */
import { createSocial, connectedAccountRef } from '@opencoredev/social-sdk';
import { mockBackend } from '@opencoredev/social-sdk/testing';

const COPY = '01-lie. 02-caught. 03-receipt. A receipt when the line is right or wrong.';
const ORDER = ['linkedin', 'tiktok', 'youtube'];

const social = createSocial({
  backend: mockBackend({ scenario: 'immediate-text-success' }),
});

const outcomes = [];
for (const platform of ORDER) {
  const result = await social.posts.publish({
    targets: [
      {
        account: connectedAccountRef({
          backend: 'default',
          platform,
          accountId: 'mock-account-1',
        }),
      },
    ],
    content: { text: COPY },
    idempotencyKey: `cmo-mock-${platform}`,
  });
  outcomes.push({
    platform,
    status: result.status,
    state: result.outcomes[0]?.state ?? 'missing',
  });
}

const body = { mock: true, order: ORDER, copy: COPY, outcomes };
process.stdout.write(`${JSON.stringify(body)}\n`);

const publishedInOrder =
  outcomes.length === ORDER.length &&
  outcomes.every((row, i) => row.platform === ORDER[i] && row.state === 'published' && row.status === 'complete');
if (!publishedInOrder) process.exitCode = 1;
