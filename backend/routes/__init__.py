"""Modular API route packages (incremental refactor out of server.py).

Each module defines an ``APIRouter`` named ``router`` and imports shared
application infrastructure (db, auth deps, helpers) from ``server`` at import
time. These routers are included into the main ``/api`` router near the bottom
of ``server.py`` (after all infra is defined) to avoid circular imports.
"""
