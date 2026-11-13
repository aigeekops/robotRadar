"""Executed against the real MuJoCo engine and the official G1 Mode 10 URDF."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'services/mujoco'))
from simulation import compare, load_model, profile, validate_request


class DynamicsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = load_model()
        cls.result = compare(cls.model, {'joint': 'left_elbow_joint', 'torque': 0.2, 'duration': 0.2})

    def test_exact_configuration(self):
        info = profile(self.model)
        self.assertEqual(info['configuration'], 'g1_23dof_mode_10')
        self.assertEqual(info['jointCount'], 23)
        self.assertEqual(info['actuatorCount'], 0)
        self.assertEqual(info['base'], 'fixed')

    def test_real_time_advance_and_finite_state(self):
        for result in [self.result['baseline'], self.result['controlled']]:
            self.assertEqual(result['steps'], 200)
            self.assertAlmostEqual(result['durationSeconds'], 0.2, places=10)
            self.assertTrue(result['finite'])
            self.assertEqual(result['warnings'], [])
            self.assertEqual(len(result['samples']), 21)
            self.assertEqual(len(result['final']['positions']), 23)

    def test_torque_changes_actual_result(self):
        self.assertTrue(self.result['comparison']['sameInitialState'])
        self.assertTrue(self.result['comparison']['differentResult'])
        self.assertGreater(abs(self.result['comparison']['finalPositionDeltaRad']), 1e-5)

    def test_zero_torque_comparison_identical(self):
        result = compare(self.model, {'joint': 'left_elbow_joint', 'torque': 0, 'duration': 0.05})
        self.assertFalse(result['comparison']['differentResult'])
        self.assertEqual(result['baseline']['samples'], result['controlled']['samples'])

    def test_repeatable_reset(self):
        result = compare(self.model, {'joint': 'left_elbow_joint', 'torque': 0.2, 'duration': 0.2})
        self.assertEqual(result['controlled']['samples'], self.result['controlled']['samples'])

    def test_boundaries_rejected(self):
        invalid = [
            {'torque': 1}, {'torque': -1}, {'torque': float('nan')},
            {'torque': True}, {'torque': '0.2'}, {'duration': 100},
            {'duration': 0}, {'duration': float('inf')}, {'joint': 'missing'},
            {'joint': '../secret'}, {'code': 'print(1)'}, [],
        ]
        for request in invalid:
            with self.subTest(request=request):
                with self.assertRaises(ValueError):
                    validate_request(self.model, request)

    def test_all_allowed_joints_at_torque_boundaries(self):
        for joint in profile(self.model)['joints']:
            for torque in (-0.5, 0.5):
                with self.subTest(joint=joint['name'], torque=torque):
                    result = compare(self.model, {'joint': joint['name'], 'torque': torque, 'duration': 0.5})
                    self.assertTrue(result['controlled']['finite'])
                    self.assertEqual(result['controlled']['warnings'], [])

    def test_largest_allowed_run_finite(self):
        result = compare(self.model, {'joint': 'left_elbow_joint', 'torque': 0.5, 'duration': 0.5})
        self.assertTrue(result['controlled']['finite'])
        self.assertEqual(result['controlled']['steps'], 500)


if __name__ == '__main__':
    unittest.main()
