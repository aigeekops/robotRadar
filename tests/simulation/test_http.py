"""HTTP contract tests; start sh services/mujoco/run.sh before running this file."""
import http.client
import json
import unittest


class HttpTest(unittest.TestCase):
    def request(self, method, path, data=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', 8765, timeout=10)
        connection.request(method, path, data, headers or {})
        response = connection.getresponse()
        status, response_headers, raw = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return status, response_headers, json.loads(raw) if raw else None

    def test_health(self):
        status, _, body = self.request('GET', '/health')
        self.assertEqual(status, 200)
        self.assertEqual(body['configuration'], 'g1_23dof_mode_10')

    def test_profile(self):
        status, _, body = self.request('GET', '/profile')
        self.assertEqual(status, 200)
        self.assertEqual(len(body['joints']), 23)

    def test_simulate_real_engine(self):
        status, headers, body = self.request('POST', '/simulate', json.dumps({'torque': 0.2, 'duration': 0.2}), {'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:5173'})
        self.assertEqual(status, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173')
        self.assertTrue(body['comparison']['differentResult'])
        self.assertAlmostEqual(body['controlled']['durationSeconds'], 0.2)

    def test_preflight(self):
        status, headers, _ = self.request('OPTIONS', '/simulate', headers={'Origin': 'http://localhost:4173'})
        self.assertEqual(status, 204)
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://localhost:4173')
        self.assertEqual(headers['Access-Control-Allow-Headers'], 'Content-Type')

    def test_external_origin_rejected(self):
        status, headers, _ = self.request('POST', '/simulate', '{}', {'Content-Type': 'application/json', 'Origin': 'https://example.com'})
        self.assertEqual(status, 403)
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_unlisted_local_port_rejected(self):
        status, _, _ = self.request('GET', '/health', headers={'Origin': 'http://localhost:9999'})
        self.assertEqual(status, 403)

    def test_host_rejected(self):
        status, _, _ = self.request('GET', '/health', headers={'Host': 'example.com:8765'})
        self.assertEqual(status, 403)

    def test_non_json_rejected(self):
        status, _, _ = self.request('POST', '/simulate', '{}', {'Content-Type': 'text/plain'})
        self.assertEqual(status, 415)

    def test_oversized_rejected(self):
        status, _, _ = self.request('POST', '/simulate', 'x' * 5000, {'Content-Type': 'application/json'})
        self.assertEqual(status, 413)

    def test_arbitrary_code_rejected(self):
        status, _, _ = self.request('POST', '/simulate', json.dumps({'code': 'print(1)'}), {'Content-Type': 'application/json'})
        self.assertEqual(status, 400)

    def test_invalid_numeric_range(self):
        status, _, _ = self.request('POST', '/simulate', json.dumps({'torque': 2000}), {'Content-Type': 'application/json'})
        self.assertEqual(status, 400)


if __name__ == '__main__':
    unittest.main()
