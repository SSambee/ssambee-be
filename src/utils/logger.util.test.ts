import { MorganLambdaStream, LOG_LEVEL } from './logger.util.js';
import { config } from '../config/env.config.js';

// Mock config
jest.mock('../config/env.config.js', () => ({
  config: {
    MONITOR_LAMBDA_URL: 'https://example.com/log',
    INTERNAL_INGEST_SECRET: 'test-api-key',
  },
}));

describe('MorganLambdaStream', () => {
  let stream: MorganLambdaStream;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    stream = new MorganLambdaStream();
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        ),
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send log to Lambda with envelope when URL is configured', async () => {
    const logMessage = 'GET /health 200';
    stream.write(logMessage);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/log/ingest',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-api-key',
        }),
        body: expect.stringContaining('"logs":['),
      }),
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const payload = body.logs[0];
    expect(payload.message).toBe(logMessage);
    expect(payload.level).toBe(LOG_LEVEL.INFO);
    expect(payload.timestamp).toBeDefined();
  });

  it('should categorize 5xx status codes as ERROR', async () => {
    const logMessage = 'POST /login 500';
    stream.write(logMessage);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.logs[0].level).toBe(LOG_LEVEL.ERROR);
  });

  it('should not send log when URL is missing', () => {
    // Override mock for this test
    config.MONITOR_LAMBDA_URL = undefined;

    stream.write('test');

    expect(fetchSpy).not.toHaveBeenCalled();

    // Restore mock
    config.MONITOR_LAMBDA_URL = 'https://example.com/log';
  });

  it('should handle fetch errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    fetchSpy.mockImplementation(() =>
      Promise.reject(new Error('Network error')),
    );

    stream.write('test');

    // Wait for the async catch block to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[MorganLambdaStream] Failed to send log to Lambda',
      ),
      expect.any(Error),
    );
  });
});
