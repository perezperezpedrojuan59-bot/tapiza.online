PYTHON ?= python3

.PHONY: run test

run:
	PYTHONPATH=src $(PYTHON) -m job.main

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests -p "test_*.py"
