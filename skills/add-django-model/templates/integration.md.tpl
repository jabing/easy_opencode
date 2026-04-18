# {{subject}} model integration guide

## Follow-up checklist

- Add the model to any serializers, forms, or services that should reference it.
- Run `python manage.py makemigrations` and inspect the migration output.
- Extend the starter test with database-backed assertions once the schema settles.
