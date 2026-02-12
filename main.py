"""
Main Entry Point for OpenCLAW Python Agent (Render/Railway)
"""
import os
import time
import signal
import sys
from self_improvement.strategy_reflector import StrategyReflector
from self_improvement.social_poster import SocialPoster

def run_agent_loop():
    print("OpenCLAW Python Agent Starting...")
    reflector = StrategyReflector()
    poster = SocialPoster()
    
    last_post_time = 0
    POST_INTERVAL = 24 * 3600 # 24 hours

    while True:
        try:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Heartbeat: Agent Active")
            
            # Daily Social Post
            current_time = time.time()
            if current_time - last_post_time > POST_INTERVAL:
                poster.run_daily_cycle()
                last_post_time = current_time
                reflector.reflect_on_interaction({"action": "daily_post"}, True)
            
            # Simulate a continuous background process
            time.sleep(60) 
            
        except KeyboardInterrupt:
            print("Stopping agent...")
            break
        except Exception as e:
            print(f"Error in main loop: {e}")
            reflector.reflect_on_interaction({"type": "main_loop_error"}, False, str(e))
            time.sleep(30)

if __name__ == "__main__":
    run_agent_loop()
