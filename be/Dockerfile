FROM python:3.13-slim

WORKDIR /app

# libpq for psycopg2. No build-essential: psycopg2-binary ships wheels, which is
# why the requirements pin the binary package.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/

# Collected at BUILD time so the admin is never served unstyled after a
# dependency's assets move. Needs no database — collectstatic only imports
# settings and walks app directories. A throwaway key because settings refuses
# to boot without one and this value never leaves the build layer.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput --clear

EXPOSE 8000
CMD ["gunicorn", "-c", "gunicorn.conf.py", "recruit.wsgi:application"]
