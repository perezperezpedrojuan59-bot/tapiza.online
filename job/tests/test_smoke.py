import unittest

from job.main import get_project_name


class SmokeTests(unittest.TestCase):
    def test_project_name(self) -> None:
        self.assertEqual(get_project_name(), "tapiza.online")


if __name__ == "__main__":
    unittest.main()
