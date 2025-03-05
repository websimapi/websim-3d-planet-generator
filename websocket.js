class WebsimSocket {
  constructor() {
    this.socket = new WebSocket(`wss://${window.location.host}/socket`);
    this.socket.onopen = this.onOpen.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
    this.party = {
      client: { id: null, username: null },
      peers: {},
      subscribe: this.subscribeToParty.bind(this)
    };
    this._partySubscribers = [];
    this._collectionSubscribers = {};
    this._collections = {};
  }

  onOpen() {
    console.log('Connected to WebSocket');
  }

  handleMessage(event) {
    const data = JSON.parse(event.data);
    
    // Handle party updates
    if (data.type === 'party_update') {
      this.party.peers = data.peers;
      if (data.client) {
        this.party.client = data.client;
      }
      this._notifyPartySubscribers();
    }
    
    // Handle collection updates
    if (data.type === 'collection_update') {
      const { collection, records } = data;
      this._collections[collection] = records;
      this._notifyCollectionSubscribers(collection);
    }
    
    // Forward other messages to onmessage handler if defined
    if (this.onmessage) {
      this.onmessage(event);
    }
  }

  send(data) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn('Socket not open, message not sent:', data);
    }
  }

  subscribeToParty(callback) {
    this._partySubscribers.push(callback);
    return () => {
      this._partySubscribers = this._partySubscribers.filter(cb => cb !== callback);
    };
  }

  _notifyPartySubscribers() {
    for (const callback of this._partySubscribers) {
      callback(this.party.peers);
    }
  }

  _notifyCollectionSubscribers(collection) {
    if (this._collectionSubscribers[collection]) {
      const records = this._collections[collection] || [];
      for (const subscriber of this._collectionSubscribers[collection]) {
        subscriber.callback(records);
      }
    }
  }

  collection(type) {
    return {
      _filter: {},
      filter: (filterObj) => {
        const newCollection = this.collection(type);
        newCollection._filter = filterObj;
        return newCollection;
      },
      getList: () => {
        const allRecords = this._collections[type] || [];
        if (Object.keys(this._filter || {}).length === 0) {
          return allRecords;
        }
        
        return allRecords.filter(record => {
          for (const [key, value] of Object.entries(this._filter)) {
            if (record[key] !== value) return false;
          }
          return true;
        });
      },
      subscribe: (callback) => {
        if (!this._collectionSubscribers[type]) {
          this._collectionSubscribers[type] = [];
        }
        
        const subscriber = { callback, filter: this._filter };
        this._collectionSubscribers[type].push(subscriber);
        
        // Call immediately with current data
        const records = this.collection(type).filter(this._filter).getList();
        callback(records);
        
        return () => {
          if (this._collectionSubscribers[type]) {
            this._collectionSubscribers[type] = this._collectionSubscribers[type]
              .filter(s => s.callback !== callback);
          }
        };
      },
      create: async (data) => {
        return new Promise((resolve, reject) => {
          const requestId = Date.now().toString();
          
          const handleResponse = (event) => {
            const response = JSON.parse(event.data);
            if (response.type === 'record_created' && response.requestId === requestId) {
              this.socket.removeEventListener('message', handleResponse);
              resolve(response.record);
            }
            if (response.type === 'record_error' && response.requestId === requestId) {
              this.socket.removeEventListener('message', handleResponse);
              reject(new Error(response.error));
            }
          };
          
          this.socket.addEventListener('message', handleResponse);
          
          this.send({
            type: 'create_record',
            collection: type,
            data,
            requestId
          });
        });
      },
      update: async (id, data) => {
        return new Promise((resolve, reject) => {
          const requestId = Date.now().toString();
          
          const handleResponse = (event) => {
            const response = JSON.parse(event.data);
            if (response.type === 'record_updated' && response.requestId === requestId) {
              this.socket.removeEventListener('message', handleResponse);
              resolve(response.record);
            }
            if (response.type === 'record_error' && response.requestId === requestId) {
              this.socket.removeEventListener('message', handleResponse);
              reject(new Error(response.error));
            }
          };
          
          this.socket.addEventListener('message', handleResponse);
          
          this.send({
            type: 'update_record',
            collection: type,
            id,
            data,
            requestId
          });
        });
      },
      delete: async (id) => {
        return new Promise((resolve, reject) => {
          const requestId = Date.now().toString();
          
          const handleResponse = (event) => {
            const response = JSON.parse(event.data);
            if (response.type === 'record_deleted' && response.requestId === requestId) {
              this.socket.removeEventListener('message', handleResponse);
              resolve(true);
            }
            if (response.type === 'record_error' && response.requestId === requestId) {
              this.socket.removeEventListener('message', handleResponse);
              reject(new Error(response.error));
            }
          };
          
          this.socket.addEventListener('message', handleResponse);
          
          this.send({
            type: 'delete_record',
            collection: type,
            id,
            requestId
          });
        });
      }
    };
  }
}

// Initialize the WebsimSocket
const room = new WebsimSocket();

