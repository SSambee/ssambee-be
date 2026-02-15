import { MorganLambdaStream, LOG_LEVEL } from './logger.util.js';
import { config } from '../config/env.config.js';

// Mock config
jest.mock('../config/env.config.js', () => ({
  config: {
    LOG_LAMBDA_URL: 'https://example.com/log',
    LOG_LAMBDA_API_KEY: 'test-api-key',
  },
}));

describe('MorganLambdaStream', () => {
  let stream: MorganLambdaStream;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    stream = new MorganLambdaStream();
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send log to Lambda when URL is configured', async () => {
    const logMessage = 'GET /health 200';
    stream.write(logMessage);

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/log', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key',
      }),
      body: expect.stringContaining(logMessage),
    }));

    const payload = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(payload.log).toBe(logMessage);
    expect(payload.level).toBe(LOG_LEVEL.INFO);
    expect(payload.timestamp).toBeDefined();
  });

  it('should not send log when URL is missing', () => {
    // Override mock for this test
    (config as any).LOG_LAMBDA_URL = undefined;

    stream.write('test');

    expect(fetchSpy).not.toHaveBeenCalled();

    // Restore mock
    (config as any).LOG_LAMBDA_URL = 'https://example.com/log';
  });

  it('should handle fetch errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    fetchSpy.mockImplementation(() => Promise.reject(new Error('Network error')));

    stream.write('test');

    // Wait for the async catch block to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[MorganLambdaStream] Failed to send log to Lambda'),
      expect.any(Error)
    );
  });
});
