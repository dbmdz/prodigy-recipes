try:
    # This needs to be imported in order for the entry points to be loaded
    from . import ocr_eval  # noqa: F401
except ImportError:
    pass
