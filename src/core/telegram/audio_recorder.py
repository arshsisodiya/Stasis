# src/core/telegram/audio_recorder.py
import os
import time
import threading
import wave
from src.utils.logger import setup_logger
from src.config.storage import get_data_dir

logger = setup_logger()

class MicRecorder:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MicRecorder, cls).__new__(cls)
            cls._instance._init_recorder()
        return cls._instance

    def _init_recorder(self):
        self._thread = None
        self._stop_event = threading.Event()
        self._frames = []
        self._filepath = None
        self._start_time = None
        self._callback = None
        self.is_recording = False
        
        # Audio Settings
        self.CHUNK = 1024
        self.FORMAT = None # Set dynamically
        self.CHANNELS = 1
        self.RATE = 44100
        self.MAX_DURATION_SECONDS = 600 # 10 minutes
        self.MAX_FILE_SIZE_BYTES = 48 * 1024 * 1024 # 48 MB
        self.RECORD_SECONDS_PER_MB = 1 # Approximation for limits
        
    def _get_pyaudio(self):
        try:
            import pyaudio
            return pyaudio
        except ImportError:
            logger.error("[audio_recorder] PyAudio not available.")
            return None

    def start_async_recording(self, limit_callback=None):
        if self.is_recording:
            logger.warning("[audio_recorder] Already recording.")
            return False

        pyaudio_module = self._get_pyaudio()
        if not pyaudio_module:
            return False

        self._stop_event.clear()
        self._frames = []
        self._callback = limit_callback
        
        app_dir = get_data_dir()
        os.makedirs(app_dir, exist_ok=True)
        self._filepath = os.path.join(app_dir, f"stasis_{time.strftime('%Y_%m_%d_%H_%M_%S')}.wav")

        self.FORMAT = pyaudio_module.paInt16

        self._thread = threading.Thread(target=self._record_loop, args=(pyaudio_module,), daemon=True)
        self._thread.start()
        self.is_recording = True
        return True

    def _record_loop(self, pyaudio_module):
        p = pyaudio_module.PyAudio()
        try:
            stream = p.open(format=self.FORMAT,
                            channels=self.CHANNELS,
                            rate=self.RATE,
                            input=True,
                            frames_per_buffer=self.CHUNK)
            
            logger.info("[audio_recorder] Started recording...")
            self._start_time = time.time()
            bytes_per_sample = p.get_sample_size(self.FORMAT)
            
            # WAV header size is approx 44 bytes
            current_bytes = 44
            
            while not self._stop_event.is_set():
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                self._frames.append(data)
                
                # Check limits
                current_bytes += len(data)
                elapsed_time = time.time() - self._start_time
                
                if elapsed_time >= self.MAX_DURATION_SECONDS or current_bytes >= self.MAX_FILE_SIZE_BYTES:
                    logger.info("[audio_recorder] Limit reached (time or size). Auto-stopping.")
                    break

            # Stop and close stream
            stream.stop_stream()
            stream.close()
            p.terminate()
            
            self._save_wav(p)
            self.is_recording = False
            
        except Exception as e:
            logger.error(f"[audio_recorder] Recording failed: {e}")
            self.is_recording = False
            p.terminate()

        # If stopped naturally because of limits (and not by user manual stop)
        if not self._stop_event.is_set():
            if self._callback:
                try:
                    self._callback(self._filepath)
                except Exception as cb_e:
                    logger.error(f"[audio_recorder] Callback failed: {cb_e}")

    def stop_async_recording(self):
        if not self.is_recording:
            return None
            
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2)
            
        return self._filepath

    def _save_wav(self, p):
        if not self._frames:
            return
            
        try:
            wf = wave.open(self._filepath, 'wb')
            wf.setnchannels(self.CHANNELS)
            wf.setsampwidth(p.get_sample_size(self.FORMAT))
            wf.setframerate(self.RATE)
            wf.writeframes(b''.join(self._frames))
            wf.close()
            logger.info(f"[audio_recorder] Saved audio: {self._filepath}")
        except Exception as e:
            logger.error(f"[audio_recorder] Error saving WAV file: {e}")

    def record_fixed_duration(self, duration: int):
        """ Blocking record for a fixed duration, up to the max limits """
        if self.is_recording:
            return None
            
        duration = min(duration, self.MAX_DURATION_SECONDS)
        
        pyaudio_module = self._get_pyaudio()
        if not pyaudio_module:
            return None

        app_dir = get_data_dir()
        os.makedirs(app_dir, exist_ok=True)
        filepath = os.path.join(app_dir, f"stasis_{time.strftime('%Y_%m_%d_%H_%M_%S')}.wav")

        self.FORMAT = pyaudio_module.paInt16
        p = pyaudio_module.PyAudio()
        
        frames = []
        try:
            stream = p.open(format=self.FORMAT,
                            channels=self.CHANNELS,
                            rate=self.RATE,
                            input=True,
                            frames_per_buffer=self.CHUNK)
            
            logger.info(f"[audio_recorder] Starting fixed recording for {duration}s...")
            start_time = time.time()
            current_bytes = 44
            
            while (time.time() - start_time) < duration:
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                frames.append(data)
                current_bytes += len(data)
                
                if current_bytes >= self.MAX_FILE_SIZE_BYTES:
                    logger.info("[audio_recorder] Size limit reached during fixed record.")
                    break
                    
            stream.stop_stream()
            stream.close()
            
            wf = wave.open(filepath, 'wb')
            wf.setnchannels(self.CHANNELS)
            wf.setsampwidth(p.get_sample_size(self.FORMAT))
            wf.setframerate(self.RATE)
            wf.writeframes(b''.join(frames))
            wf.close()
            
            return filepath
        except Exception as e:
            logger.error(f"[audio_recorder] Fixed recording failed: {e}")
            return None
        finally:
            p.terminate()
