"""
Social Poster - content generation and publishing module.
"""
import os
import google.generativeai as genai
from openai import OpenAI
import praw
import time

class SocialPoster:
    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY_1")
        self.nvidia_key = os.getenv("NVIDIA_API_KEY")
        self.reddit_client_id = os.getenv("REDDIT_CLIENT_ID") # User needs to provide this
        self.reddit_client_secret = os.getenv("REDDIT_CLIENT_SECRET") # User needs to provide this
        self.reddit_username = os.getenv("REDDIT_USERNAME")
        self.reddit_password = os.getenv("REDDIT_PASSWORD")
        
        self._setup_ai()

    def _setup_ai(self):
        if self.gemini_key:
            genai.configure(api_key=self.gemini_key)
        
        if self.nvidia_key:
            self.nvidia_client = OpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=self.nvidia_key
            )

    def generate_content(self, topic: str) -> str:
        """Generates a post about the topic using available AI."""
        prompt = f"Write a short, engaging social media post about {topic} in the context of AGI research and the OpenCLAW project."
        
        try:
            # Try NVIDIA first
            if hasattr(self, 'nvidia_client'):
                completion = self.nvidia_client.chat.completions.create(
                    model="meta/llama-3.1-405b-instruct",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=200
                )
                return completion.choices[0].message.content
        except Exception as e:
            print(f"NVIDIA generation failed: {e}")

        try:
            # Fallback to Gemini
            if self.gemini_key:
                model = genai.GenerativeModel('gemini-pro')
                response = model.generate_content(prompt)
                return response.text
        except Exception as e:
            print(f"Gemini generation failed: {e}")

        return f"Researching {topic} for OpenCLAW AGI initiatives. #AGI #OpenCLAW"

    def post_to_reddit(self, content: str, subreddit: str = "AGI"):
        if not (self.reddit_client_id and self.reddit_client_secret):
            print("Skipping Reddit: Missing CLIENT_ID/SECRET")
            return

        try:
            reddit = praw.Reddit(
                client_id=self.reddit_client_id,
                client_secret=self.reddit_client_secret,
                username=self.reddit_username,
                password=self.reddit_password,
                user_agent="OpenCLAW_Agent/1.0"
            )
            reddit.subreddit(subreddit).submit(title="OpenCLAW Research Update", selftext=content)
            print(f"Posted to Reddit r/{subreddit}")
        except Exception as e:
            print(f"Reddit post failed: {e}")

    def post_to_moltbook(self, content: str):
        if not self.moltbook_key:
            print("Skipping Moltbook: Missing API Key")
            return

        url = "https://www.moltbook.com/api/v1/posts"
        headers = {
            "Authorization": f"Bearer {self.moltbook_key}",
            "Content-Type": "application/json"
        }
        
        # Rotational topics based on user's pillars
        title = "OpenCLAW AGI Research Update"
        payload = {
            "title": title,
            "content": content + "\n\n#OpenCLAW #AGI #Neuromorphic",
            "submolt": "agi" 
        }

        try:
            import requests
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            if 200 <= response.status_code < 300:
                print(f"Moltbook post successful: {response.status_code}")
            else:
                print(f"Moltbook post failed: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Moltbook post error: {e}")

    def run_daily_cycle(self):
        print("Running daily social cycle...")
        content = self.generate_content("Neuromorphic Computing")
        print(f"Generated Content: {content}")
        
        # Post to platforms
        self.post_to_reddit(content)
        self.post_to_moltbook(content)

if __name__ == "__main__":
    poster = SocialPoster()
    poster.run_daily_cycle()
