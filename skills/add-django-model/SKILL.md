---
name: add-django-model
description: Scaffold a Django model starter.
origin: EOC
---

# Add Django Model

This executable skill scaffolds a starter artifact for common development work.

## When to Use

- add django model
- new model

## Runtime Coverage

- python

## Verify Afterwards

- `python manage.py makemigrations --check || true`
- `pytest -q`
