"""Location lookups — the dropdowns, and nothing else.

Anonymous and unpaginated. A district list that arrives ten at a time is a
dropdown that cannot be used, and these are public facts about India rather
than anything belonging to a user.
"""

from rest_framework import serializers

from location.models import Block, District, State


class StateSerializer(serializers.ModelSerializer):
    class Meta:
        model = State
        fields = ("id", "name", "is_union_territory")


class DistrictSerializer(serializers.ModelSerializer):
    class Meta:
        model = District
        fields = ("id", "name", "state")


class BlockSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Block
        fields = ("id", "name", "kind", "kind_label", "district")
