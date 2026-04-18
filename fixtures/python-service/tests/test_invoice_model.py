from app.models.invoice import Invoice


def test_invoice_string_representation() -> None:
    instance = Invoice(name='starter')
    assert str(instance) == 'starter'
