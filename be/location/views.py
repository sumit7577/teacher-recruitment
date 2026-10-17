"""Three lists, for three dependent dropdowns.

`GET v1/public/locations/states/`
`GET v1/public/locations/districts/?state=<id>`
`GET v1/public/locations/blocks/?district=<id>`

Anonymous, because a registration form has to render these before anyone has
an account. Unpaginated for the same reason a `<select>` is not paginated —
and bounded instead by requiring the parent id, so nobody can ask for all
seven thousand blocks in India at once.
"""

from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny

from location.models import Block, District, State
from location.serializer import BlockSerializer, DistrictSerializer, StateSerializer


class _Public(ListAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = None


class StateList(_Public):
    serializer_class = StateSerializer
    queryset = State.objects.all()


class DistrictList(_Public):
    serializer_class = DistrictSerializer

    def get_queryset(self):
        rows = District.objects.all()
        if state := self.request.query_params.get("state"):
            return rows.filter(state_id=state)
        if query := (self.request.query_params.get("q") or "").strip():
            # Typing a district without choosing a state first is the normal
            # way people fill these in. Capped, because this is the one list
            # here big enough to be worth sending unbounded.
            return rows.filter(name__icontains=query)[:50]
        # No parent and no search: refuse rather than return 780 rows to a
        # dropdown that has not been narrowed.
        return rows.none()


class BlockList(_Public):
    serializer_class = BlockSerializer

    def get_queryset(self):
        rows = Block.objects.all()
        district = self.request.query_params.get("district")
        if not district:
            return rows.none()
        return rows.filter(district_id=district)
