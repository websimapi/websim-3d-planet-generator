import PlanetRenderer from './planetRenderer.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

const { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } = React;

const App = () => {
  const [planetName, setPlanetName] = useState('');
  const [planetDescription, setPlanetDescription] = useState('');
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [error, setError] = useState('');

  // Use the WebsimSocket from the global scope
  const planets = useSyncExternalStore(
    room.collection('planet').subscribe,
    room.collection('planet').getList
  );
  
  // Create and manage the main planet renderer
  const mainPlanetRendererRef = useRef(null);
  const planetContainerRef = useRef(null);
  
  // Initialize the main planet renderer
  useEffect(() => {
    if (!mainPlanetRendererRef.current && planetContainerRef.current) {
      mainPlanetRendererRef.current = new PlanetRenderer('planet-container');
      mainPlanetRendererRef.current.initialize();
    }
    
    return () => {
      if (mainPlanetRendererRef.current) {
        mainPlanetRendererRef.current.dispose();
        mainPlanetRendererRef.current = null;
      }
    };
  }, []);
  
  // When a new planet is selected, update the main renderer
  useEffect(() => {
    if (selectedPlanet && mainPlanetRendererRef.current) {
      mainPlanetRendererRef.current.setPlanetTexture(selectedPlanet.imageUrl)
        .catch(error => {
          console.error('Failed to set texture for selected planet:', error);
        });
    }
  }, [selectedPlanet]);
  
  // Generate a planet with AI
  const generatePlanet = async (e) => {
    e.preventDefault();
    
    if (isGenerating) return;
    if (!planetName.trim()) {
      setError('Please enter a planet name.');
      return;
    }
    
    try {
      setError('');
      setIsGenerating(true);
      setGenerationStep(1);
      
      // Step 1: Generate a detailed description of the planet using the LLM
      const descriptionPrompt = `Create a detailed, scientific yet imaginative description of a planet named "${planetName}". 
      Include details about its atmosphere, terrain, unique features, potential for life, orbital characteristics, and any other 
      interesting astronomical information. Make it sound like an entry in a cosmic encyclopedia. Be specific and creative.`;
      
      let generatedDescription = '';
      if (planetDescription.trim()) {
        // Use the user's description if provided
        generatedDescription = planetDescription;
      } else {
        // Otherwise generate a description with the LLM
        const completion = await websim.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are an astronomy expert with a vivid imagination. Create detailed, scientifically plausible descriptions of fictional planets."
            },
            {
              role: "user",
              content: descriptionPrompt
            }
          ]
        });
        generatedDescription = completion.content;
      }
      
      setGenerationStep(2);
      
      // Step 2: Generate an image based on the description
      const imagePrompt = `Create a realistic texture map of planet "${planetName}": ${generatedDescription}. The image should work as a seamless texture for a 3D planet. Show the entire planet surface from above with consistent lighting.`;
      
      const imageResult = await websim.imageGen({
        prompt: imagePrompt,
        aspect_ratio: "1:1"
      });
      
      setGenerationStep(3);
      
      // Step 3: Save the planet to the database
      const newPlanet = await room.collection('planet').create({
        name: planetName,
        description: generatedDescription,
        imageUrl: imageResult.url,
        prompt: imagePrompt,
        createdAt: new Date().toISOString()
      });
      
      // Update the main renderer with the new planet
      if (mainPlanetRendererRef.current) {
        await mainPlanetRendererRef.current.setPlanetTexture(imageResult.url);
      }
      
      // Reset form and state
      setPlanetName('');
      setPlanetDescription('');
      setSelectedPlanet(newPlanet);
      setGenerationStep(4);
    } catch (error) {
      console.error('Error generating planet:', error);
      setError(`Failed to generate planet: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Sort planets by creation date (newest first)
  const sortedPlanets = useMemo(() => {
    return [...planets].sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [planets]);
  
  return (
    <div className="app-container">
      <header className="header">
        <h1>3D Planet Generator</h1>
        <p>Create and explore procedurally generated planets using AI</p>
      </header>
      
      <div className="content">
        <div className="planet-container" id="planet-container" ref={planetContainerRef}></div>
        
        <div className="side-panel">
          <form className="generator-form" onSubmit={generatePlanet}>
            <h2>Create New Planet</h2>
            
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="planet-name">Planet Name</label>
              <input
                id="planet-name"
                type="text"
                value={planetName}
                onChange={(e) => setPlanetName(e.target.value)}
                placeholder="Enter planet name"
                disabled={isGenerating}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="planet-description">Description (Optional)</label>
              <textarea
                id="planet-description"
                value={planetDescription}
                onChange={(e) => setPlanetDescription(e.target.value)}
                placeholder="Enter a description or leave blank for AI-generated description"
                disabled={isGenerating}
              ></textarea>
            </div>
            
            <button type="submit" disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate Planet'}
            </button>
            
            {isGenerating && (
              <div className="progress-steps">
                <div className={`progress-step ${generationStep >= 1 ? 'active' : ''} ${generationStep > 1 ? 'completed' : ''}`}>
                  {generationStep > 1 ? '✓' : ''} Generating planet description...
                </div>
                <div className={`progress-step ${generationStep >= 2 ? 'active' : ''} ${generationStep > 2 ? 'completed' : ''}`}>
                  {generationStep > 2 ? '✓' : ''} Creating planet texture...
                </div>
                <div className={`progress-step ${generationStep >= 3 ? 'active' : ''} ${generationStep > 3 ? 'completed' : ''}`}>
                  {generationStep > 3 ? '✓' : ''} Saving to database...
                </div>
                <div className={`progress-step ${generationStep >= 4 ? 'active' : ''}`}>
                  {generationStep >= 4 ? '✓ Planet generated successfully!' : ''}
                </div>
              </div>
            )}
          </form>
          
          {selectedPlanet && (
            <div className="selected-planet-info">
              <h3>{selectedPlanet.name}</h3>
              <p>{selectedPlanet.description.substring(0, 200)}...</p>
              <button onClick={() => setSelectedPlanet(null)}>Clear Selection</button>
            </div>
          )}
        </div>
      </div>
      
      <div className="gallery">
        <h2>Planet Gallery</h2>
        <div className="planet-cards">
          {sortedPlanets.map(planet => (
            <PlanetCard 
              key={planet.id} 
              planet={planet} 
              onSelect={() => setSelectedPlanet(planet)} 
            />
          ))}
        </div>
      </div>
      
      {selectedPlanet && (
        <PlanetDetails 
          planet={selectedPlanet} 
          onClose={() => setSelectedPlanet(null)} 
        />
      )}
      
      {isGenerating && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}
    </div>
  );
};

const PlanetCard = ({ planet, onSelect }) => {
  return (
    <div className="planet-card" onClick={onSelect}>
      <div className="planet-card-preview">
        <img src={planet.imageUrl} alt={planet.name} />
      </div>
      <div className="planet-card-content">
        <h3>{planet.name}</h3>
        <p>{planet.description.substring(0, 100)}...</p>
        <div className="username">Created by: {planet.username}</div>
      </div>
    </div>
  );
};

const PlanetDetails = ({ planet, onClose }) => {
  return (
    <div className="planet-details">
      <div className="planet-details-content">
        <button className="close-button" onClick={onClose}>×</button>
        <div className="details-grid">
          <div className="details-image">
            <img src={planet.imageUrl} alt={planet.name} />
          </div>
          <div className="details-text">
            <h2>{planet.name}</h2>
            <p>{planet.description}</p>
            <div className="details-meta">
              <p>Created by: {planet.username}</p>
              <p>Date: {new Date(planet.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

