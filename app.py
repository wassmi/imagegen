from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
import os
import replicate
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import requests
import io
from flask import send_file
from flask import session
import atexit
from apscheduler.schedulers.background import BackgroundScheduler
from flask import abort
from sqlalchemy.exc import SQLAlchemyError
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Load environment variables
load_dotenv()

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
REPLICATE_API_TOKEN = os.getenv('REPLICATE_API_TOKEN')

if not REPLICATE_API_TOKEN:
    raise ValueError("REPLICATE_API_TOKEN is not set in the environment")

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Database configuration for SQLite
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///images.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Set up rate limiting
limiter = Limiter(
    key_func=get_remote_address,
    app=app
)

# Define the models
class Image(db.Model):
    __tablename__ = 'Images'
    id = db.Column(db.Integer, primary_key=True)
    image_data = db.Column(db.LargeBinary)
    image_type = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    generations = db.relationship('Generation', backref='image', lazy=True)

class Generation(db.Model):
    __tablename__ = 'Generations'
    id = db.Column(db.Integer, primary_key=True)
    prompt = db.Column(db.String(500), nullable=False)
    image_id = db.Column(db.Integer, db.ForeignKey('Images.id'), nullable=False)
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)

class User(db.Model):
    __tablename__ = 'Users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

class Favorite(db.Model):
    __tablename__ = 'Favorites'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('Users.id'), nullable=False)
    image_id = db.Column(db.Integer, db.ForeignKey('Images.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Add these relationships to your existing User and Image models
    User.favorites = db.relationship('Favorite', backref='user', lazy=True)
    Image.favorites = db.relationship('Favorite', backref='image', lazy=True)

class RecycleBin(db.Model):
    __tablename__ = 'RecycleBin'
    id = db.Column(db.Integer, primary_key=True)
    image_id = db.Column(db.Integer, db.ForeignKey('Images.id'), nullable=False)
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
@limiter.limit("10 per minute")
def generate_image():
    try:
        data = request.form
        image_file = request.files.get('image_upload')

        # Validate required parameter
        if not data.get('prompt'):
            return jsonify({"error": "Prompt is required"}), 400

        # Define valid aspect ratios
        valid_aspect_ratios = ["1:1", "16:9", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"]

        # Use default aspect ratio if not provided or invalid
        aspect_ratio = data.get('aspect_ratio', '1:1')
        if aspect_ratio not in valid_aspect_ratios:
            aspect_ratio = '1:1'  # Default to 1:1 if invalid

        input_data = {
            "prompt": data.get('prompt'),
            "num_outputs": 1,
            "guidance_scale": float(data.get('prompt_strength', 7.5)),
            "aspect_ratio": aspect_ratio,
            "output_format": data.get('image_format', 'png'),
            "output_quality": int(data.get('quality', 75)),
            "disable_safety_check": data.get('disable_safety_check') == 'true'
        }

        if image_file and allowed_file(image_file.filename):
            filename = secure_filename(image_file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            image_file.save(filepath)
            input_data['image'] = open(filepath, "rb")
        elif data.get('image_url'):
            input_data['image'] = data.get('image_url')

        # Remove None values
        input_data = {k: v for k, v in input_data.items() if v is not None}

        client = replicate.Client(api_token=REPLICATE_API_TOKEN)
        output = client.run(
            "black-forest-labs/flux-schnell",
            input=input_data
        )

        # The output is typically a list of image URLs
        image_url = output[0] if isinstance(output, list) and output else None

        if image_url:
            # Fetch the image data
            response = requests.get(image_url)
            if response.status_code == 200:
                # Create new Image and Generation records
                new_image = Image(image_data=response.content, image_type=data.get('image_format', 'png'))
                db.session.add(new_image)
                db.session.flush()  # This will assign an id to new_image

                new_generation = Generation(prompt=data.get('prompt'), image_id=new_image.id)
                db.session.add(new_generation)
                db.session.commit()

                print(f"New image generated and saved. Image ID: {new_image.id}, Generation ID: {new_generation.id}")

                # For now, we'll assume user_id is 1. In a real app, you'd get this from the logged-in user
                user_id = 1
                is_favorite = Favorite.query.filter_by(user_id=user_id, image_id=new_image.id).first() is not None

                return jsonify({
                    "image_url": image_url, 
                    "generation_id": new_generation.id,
                    "is_favorite": is_favorite
                })
            else:
                raise ValueError(f"Failed to fetch image from URL: {image_url}")
        else:
            raise ValueError("No image URL returned from Replicate")

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"An error occurred while generating the image: {str(e)}"}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/images')
def get_images():
    try:
        user_id = 1  # Assume user_id is 1 for now
        
        # Exclude images that are in the recycle bin
        subquery = db.session.query(RecycleBin.image_id)
        generations = Generation.query.filter(~Generation.image_id.in_(subquery)).order_by(Generation.generated_at.desc()).limit(20).all()
        
        favorite_image_ids = db.session.query(Favorite.image_id).filter_by(user_id=user_id).all()
        favorite_image_ids = [fav[0] for fav in favorite_image_ids]
        
        return jsonify([
            {
                "id": gen.id,
                "prompt": gen.prompt,
                "image_url": f"/image/{gen.image_id}",
                "is_favorite": gen.image_id in favorite_image_ids
            }
            for gen in generations
        ])
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "An error occurred while fetching images"}), 500

@app.route('/image/<int:image_id>')
def get_image(image_id):
    try:
        image = Image.query.get_or_404(image_id)
        return send_file(
            io.BytesIO(image.image_data),
            mimetype=f'image/{image.image_type}',
            as_attachment=False
        )
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "An error occurred while fetching the image"}), 500

@app.route('/favorites', methods=['GET'])
def get_favorites():
    # For now, we'll assume user_id is 1. In a real app, you'd get this from the logged-in user
    user_id = 1
    try:
        favorites = Favorite.query.filter_by(user_id=user_id).order_by(Favorite.created_at.desc()).all()
        return jsonify([{
            "id": fav.id,
            "image_id": fav.image_id,
            "url": f"/image/{fav.image_id}",
            "prompt": Generation.query.filter_by(image_id=fav.image_id).first().prompt
        } for fav in favorites])
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "An error occurred while fetching favorites"}), 500

@app.route('/favorite/<int:image_id>', methods=['POST'])
def toggle_favorite(image_id):
    # For now, we'll assume user_id is 1. In a real app, you'd get this from the logged-in user
    user_id = 1
    try:
        favorite = Favorite.query.filter_by(user_id=user_id, image_id=image_id).first()
        if favorite:
            db.session.delete(favorite)
            status = "unfavorited"
        else:
            new_favorite = Favorite(user_id=user_id, image_id=image_id)
            db.session.add(new_favorite)
            status = "favorited"
        db.session.commit()
        return jsonify({"status": status})
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "An error occurred while toggling favorite"}), 500

@app.route('/image_history')
def image_history():
    try:
        # Exclude images that are in the recycle bin
        subquery = db.session.query(RecycleBin.image_id)
        generations = Generation.query.filter(~Generation.image_id.in_(subquery)).order_by(Generation.generated_at.desc()).all()
        
        images = [
            {
                "id": gen.id,
                "image_id": gen.image_id,
                "url": f"/image/{gen.image_id}",
                "prompt": gen.prompt,
                "created_at": gen.generated_at.isoformat()
            }
            for gen in generations
        ]
        return jsonify(images)
    except Exception as e:
        print(f"Error fetching image history: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/recycle_bin', methods=['GET'])
def get_recycle_bin():
    try:
        recycle_items = RecycleBin.query.order_by(RecycleBin.deleted_at.desc()).all()
        return jsonify([{
            "id": item.id,
            "image_id": item.image_id,
            "url": f"/image/{item.image_id}",
            "deleted_at": item.deleted_at.isoformat()
        } for item in recycle_items])
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "An error occurred while fetching the recycle bin"}), 500

@app.route('/restore_image/<int:image_id>', methods=['POST'])
def restore_image(image_id):
    try:
        recycle_item = RecycleBin.query.filter_by(image_id=image_id).first()
        if recycle_item:
            db.session.delete(recycle_item)
            db.session.commit()
            return jsonify({"status": "restored"})
        else:
            return jsonify({"status": "not found"}), 404
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "An error occurred while restoring the image"}), 500

@app.route('/delete_image/<int:image_id>', methods=['POST'])
def delete_image(image_id):
    try:
        image = Image.query.get_or_404(image_id)
        
        # Check if the image is already in the recycle bin
        existing_recycle_item = RecycleBin.query.filter_by(image_id=image_id).first()
        if existing_recycle_item:
            return jsonify({"status": "already_deleted", "message": "Image is already in the recycle bin"}), 200

        # Add the image to the recycle bin
        recycle_item = RecycleBin(image_id=image_id)
        db.session.add(recycle_item)
        db.session.commit()

        return jsonify({"status": "deleted"})
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": f"An error occurred while deleting the image: {str(e)}"}), 500


# Modify the clean_recycle_bin function
def clean_recycle_bin():
    try:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        old_items = RecycleBin.query.filter(RecycleBin.deleted_at < thirty_days_ago).all()
        
        for item in old_items:
            # Delete the image and all related records
            image = Image.query.get(item.image_id)
            if image:
                Generation.query.filter_by(image_id=image.id).delete()
                Favorite.query.filter_by(image_id=image.id).delete()
                db.session.delete(image)
            db.session.delete(item)
        
        db.session.commit()
    except SQLAlchemyError as e:
        db.session.rollback()

# Remove the clear_favorites function from startup
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        clean_recycle_bin()  # Keep this to clean the recycle bin on startup
    app.run(debug=False)

# Move the scheduler setup inside the main block
if __name__ == '__main__':
    scheduler = BackgroundScheduler()
    scheduler.add_job(func=clean_recycle_bin, trigger="interval", days=1)
    scheduler.start()

    # Shut down the scheduler when exiting the app
    atexit.register(lambda: scheduler.shutdown())

    app.run(debug=False)

# Add a new route for the recycle bin page
@app.route('/trash')
def trash_bin():
    return render_template('trash.html')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return render_template('index.html')

@app.route('/history')
def history_redirect():
    return redirect(url_for('image_history'))

@app.route('/check_database')
def check_database():
    generations = Generation.query.all()
    images = Image.query.all()
    return jsonify({
        "generations_count": len(generations),
        "images_count": len(images),
        "generations": [{"id": g.id, "image_id": g.image_id, "prompt": g.prompt} for g in generations],
        "images": [{"id": i.id, "type": i.image_type} for i in images]
    })

