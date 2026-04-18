from django.contrib import admin

from app.models.{{snake_name}} import {{subject}}


@admin.register({{subject}})
class {{subject}}Admin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at')
    search_fields = ('name',)
