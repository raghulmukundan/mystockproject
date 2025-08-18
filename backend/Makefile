.PHONY: dev test seed build clean install

install:
	pip install -r requirements.txt

dev:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	pytest tests/ -v

seed:
	python -m app.scripts.seed

build:
	docker build -t mystockproject-backend .

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete