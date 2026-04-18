from django.db import models


class Invoice(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'app'

    def __str__(self) -> str:
        return self.name
