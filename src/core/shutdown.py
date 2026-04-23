import threading
import logging

# Central shutdown event and status shared across all background services
shutdown_event = threading.Event()
shutdown_status = "graceful" # default

def trigger_shutdown(status: str = "graceful"):
    """Signals all background threads to stop and clean up."""
    global shutdown_status
    if not shutdown_event.is_set():
        logging.info(f"Shutdown signal received ({status}). Cleaning up...")
        shutdown_status = status
        shutdown_event.set()

def is_shutting_down():
    """Check if the application is in the process of shutting down."""
    return shutdown_event.is_set()
