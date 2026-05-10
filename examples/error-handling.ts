import { 
  TrustShell, 
  TrustShellAuthError, 
  TrustShellRateLimitError,
  TrustShellNetworkError 
} from '../src/index';

async function run() {
  const shell = new TrustShell({
    agentId: 'id',
    apiKey: 'key',
    llmProvider: 'anthropic'
  });

  try {
    await shell.evaluate('Action', 1.0);
  } catch (e) {
    if (e instanceof TrustShellAuthError) {
      console.log('Credentials expired or invalid.');
    } else if (e instanceof TrustShellRateLimitError) {
      console.log(`Backing off. Retry after: ${e.retryAfter}s`);
    } else if (e instanceof TrustShellNetworkError) {
      console.log('Engine is temporarily down.');
    } else {
      console.log('An unexpected error occurred.');
    }
  }
}

run();
