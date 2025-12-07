"""Package exports."""

# current lane: profile
def profile_task() -> dict[str, str]:
    return {"scope": "profile", "status": "ready"}

# current lane: compiler
def compiler_task() -> dict[str, str]:
    return {"scope": "compiler", "status": "ready"}
