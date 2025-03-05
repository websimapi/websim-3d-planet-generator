import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class PlanetRenderer {
  constructor(containerId) {
    this.containerId = containerId;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.planet = null;
    this.clouds = null;
    this.stars = null;
    this.textureLoader = new THREE.TextureLoader();
    this.initialized = false;
    this.animationId = null;
    this.currentImageUrl = null;
    this.onRenderCallback = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container with id '${this.containerId}' not found`);
      return;
    }

    // Setup scene
    this.scene = new THREE.Scene();
    
    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      60, // Field of view
      container.clientWidth / container.clientHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    this.camera.position.z = 5;
    
    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    
    // Setup controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 10;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    this.scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 3, 5);
    this.scene.add(directionalLight);

    // Create a default planet
    this.createDefaultPlanet();
    
    // Create stars background
    this.createStars();
    
    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));
    
    this.initialized = true;
    
    // Start animation loop
    this.animate();
  }

  createDefaultPlanet() {
    // Planet geometry
    const geometry = new THREE.SphereGeometry(2, 64, 64);
    
    // Default material with procedural texture
    const material = new THREE.MeshPhongMaterial({
      color: 0x2233ff,
      specular: 0x222222,
      shininess: 25,
      bumpScale: 0.05,
    });
    
    // Create the planet mesh
    this.planet = new THREE.Mesh(geometry, material);
    this.scene.add(this.planet);
  }

  createStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
      transparent: true
    });
    
    const starsVertices = [];
    for (let i = 0; i < 10000; i++) {
      const x = THREE.MathUtils.randFloatSpread(2000);
      const y = THREE.MathUtils.randFloatSpread(2000);
      const z = THREE.MathUtils.randFloatSpread(2000);
      
      // Ensure stars are not too close to the camera
      if (Math.abs(x) < 20 && Math.abs(y) < 20 && Math.abs(z) < 20) continue;
      
      starsVertices.push(x, y, z);
    }
    
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    this.stars = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(this.stars);
  }

  handleResize() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    
    if (this.planet) {
      this.planet.rotation.y += 0.001;
    }
    
    if (this.clouds) {
      this.clouds.rotation.y += 0.0015;
    }
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    
    if (this.onRenderCallback) {
      this.onRenderCallback();
    }
  }

  async setPlanetTexture(imageUrl) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.currentImageUrl === imageUrl) return;
    this.currentImageUrl = imageUrl;
    
    return new Promise((resolve, reject) => {
      try {
        // Attempt to load with direct URL
        this.loadPlanetTexture(imageUrl)
          .then(resolve)
          .catch(error => {
            console.warn('Direct texture loading failed, trying CORS proxy:', error);
            
            // Try with CORS proxy if direct loading fails
            const corsProxyUrl = `https://cors-anywhere.herokuapp.com/${imageUrl}`;
            this.loadPlanetTexture(corsProxyUrl)
              .then(resolve)
              .catch(proxyError => {
                console.error('Texture loading failed even with proxy:', proxyError);
                reject(proxyError);
              });
          });
      } catch (error) {
        console.error('Error in setPlanetTexture:', error);
        reject(error);
      }
    });
  }

  loadPlanetTexture(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        texture => {
          if (!this.planet) {
            this.createDefaultPlanet();
          }
          
          // Apply texture to planet
          texture.colorSpace = THREE.SRGBColorSpace;
          
          const material = new THREE.MeshPhongMaterial({
            map: texture,
            bumpScale: 0.05,
            specular: 0x333333,
            shininess: 15
          });
          
          this.planet.material.dispose();
          this.planet.material = material;
          
          resolve();
        },
        undefined,
        error => {
          console.error('Error loading texture:', error);
          reject(error);
        }
      );
    });
  }

  setOnRenderCallback(callback) {
    this.onRenderCallback = callback;
  }

  dispose() {
    // Cancel animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Dispose geometries and materials
    if (this.planet) {
      this.planet.geometry.dispose();
      this.planet.material.dispose();
      this.scene.remove(this.planet);
    }
    
    if (this.clouds) {
      this.clouds.geometry.dispose();
      this.clouds.material.dispose();
      this.scene.remove(this.clouds);
    }
    
    if (this.stars) {
      this.stars.geometry.dispose();
      this.stars.material.dispose();
      this.scene.remove(this.stars);
    }
    
    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      const container = document.getElementById(this.containerId);
      if (container && container.contains(this.renderer.domElement)) {
        container.removeChild(this.renderer.domElement);
      }
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    this.initialized = false;
  }
}

// Export the PlanetRenderer class
export default PlanetRenderer;

