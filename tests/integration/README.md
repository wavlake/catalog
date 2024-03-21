### Integration tests

This directory is the home of all our integration tests, which for the moment are intended to be run locally and not as part of any of our deployment pipelines.

#### Description

These tests require a local instance of Postgres DB to be running with all the latest migrations from this repo.

The tests also create temporary records in the DB that are destroyed upon completion.

#### Run Locally

From project root: `npm run integration`
