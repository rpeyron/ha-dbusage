import http from 'http';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function request(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${path}`));
        }
      });
    }).on('error', reject);
  });
}

async function runTests(): Promise<void> {
  const results: TestResult[] = [];

  try {
    console.log('Testing GET /api/tables...');
    const tables = await request('/api/tables');
    if (Array.isArray(tables)) {
      results.push({ name: 'GET /api/tables', passed: true });
      console.log('✓ Tables endpoint works');
    } else {
      results.push({ name: 'GET /api/tables', passed: false, error: 'Response is not an array' });
    }
  } catch (error) {
    results.push({ name: 'GET /api/tables', passed: false, error: (error as Error).message });
    console.error('✗ Tables endpoint failed:', (error as Error).message);
  }

  try {
    console.log('Testing GET /api/entities/summary...');
    const entities = await request('/api/entities/summary?limit=10');
    if (Array.isArray(entities)) {
      results.push({ name: 'GET /api/entities/summary', passed: true });
      console.log('✓ Entities summary endpoint works');
    } else {
      results.push({ name: 'GET /api/entities/summary', passed: false, error: 'Response is not an array' });
    }
  } catch (error) {
    results.push({ name: 'GET /api/entities/summary', passed: false, error: (error as Error).message });
    console.error('✗ Entities summary endpoint failed:', (error as Error).message);
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\nResults: ${passed}/${total} tests passed`);

  if (passed !== total) {
    console.error('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.error(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
}

setTimeout(runTests, 2000);
