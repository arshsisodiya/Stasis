import threading
import logging

# Central shutdown event shared across all background services
shutdown_event = threading.Event()

def trigger_shutdown():
    """Signals all background threads to stop and clean up."""
    if not shutdown_event.is_set():
        logging.info("Shutdown signal received. Cleaning up...")
        shutdown_event.set()

def is_shutting_down():
    """Check if the application is in the process of shutting down."""
    return shutdown_event.is_set()
