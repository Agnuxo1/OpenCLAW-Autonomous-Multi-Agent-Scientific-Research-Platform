"""
Shim server.py to redirect to main.py
This exists to satisfy any deployment config that looks for server.py by default.
"""
import main

if __name__ == "__main__":
    main.run_agent_loop()
