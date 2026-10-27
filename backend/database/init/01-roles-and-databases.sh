#!/bin/sh
# Creates the ShopScope databases and roles. Runs once inside the
# postgres container, on first start with an empty data volume.
#
#   shopscope_app_user         owns shopscope_app (Prisma). CREATEDB is only
#                              for Prisma's temporary shadow database.
#   shopscope_analytics_owner  owns the analytics tables. Used by schema/seed only.
#   shopscope_reader           SELECT-only on shopscope_analytics. Used by the API
#                              to run generated SQL. Cannot reach any other database.
set -eu

psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres \
  -v app_pw="$APP_DB_PASSWORD" \
  -v owner_pw="$ANALYTICS_OWNER_PASSWORD" \
  -v reader_pw="$ANALYTICS_READER_PASSWORD" <<'SQL'
CREATE ROLE shopscope_app_user        LOGIN CREATEDB PASSWORD :'app_pw';
CREATE ROLE shopscope_analytics_owner LOGIN PASSWORD :'owner_pw';
CREATE ROLE shopscope_reader          LOGIN NOINHERIT CONNECTION LIMIT 20 PASSWORD :'reader_pw';

-- Safety defaults for the reader. Privileges below are the real enforcement;
-- these limit damage from slow queries and make sessions read-only by default.
ALTER ROLE shopscope_reader SET default_transaction_read_only = on;
ALTER ROLE shopscope_reader SET statement_timeout = '5s';
ALTER ROLE shopscope_reader SET idle_in_transaction_session_timeout = '10s';

CREATE DATABASE shopscope_app       OWNER shopscope_app_user;
CREATE DATABASE shopscope_analytics OWNER shopscope_analytics_owner;

-- Nobody connects anywhere unless explicitly granted.
REVOKE ALL ON DATABASE shopscope_app       FROM PUBLIC;
REVOKE ALL ON DATABASE shopscope_analytics FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres  FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;

GRANT CONNECT ON DATABASE shopscope_analytics TO shopscope_reader;

\connect shopscope_analytics
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO shopscope_reader;
-- Every table the owner creates later is automatically SELECT-able by the reader.
ALTER DEFAULT PRIVILEGES FOR ROLE shopscope_analytics_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO shopscope_reader;

\connect shopscope_app
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
