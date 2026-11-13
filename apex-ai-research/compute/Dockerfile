FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
WORKDIR /srv/apex
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py train.py activate.py training_window.py ./
RUN useradd --system --home-dir /srv/apex --uid 10001 apex
USER apex
EXPOSE 8080
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","8080","--workers","1","--proxy-headers","--no-access-log"]
