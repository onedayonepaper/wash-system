const ModbusRTU = require('modbus-serial');

class ModbusDriver {
  constructor({ host, port, unitId, timeoutMs }) {
    this.host = host;
    this.port = port;
    this.unitId = unitId;
    this.timeoutMs = timeoutMs;
    this.client = new ModbusRTU();
    this.connected = false;
  }

  async connect() {
    await this.client.connectTCP(this.host, { port: this.port });
    this.client.setID(this.unitId);
    this.client.setTimeout(this.timeoutMs);
    this.connected = true;
  }

  isConnected() {
    return this.connected;
  }

  async readStatus(baseAddress, length) {
    const result = await this.client.readHoldingRegisters(baseAddress, length);
    return result.data;
  }

  async writeRegister(address, value) {
    await this.client.writeRegister(address, value);
  }

  async close() {
    if (!this.connected) {
      return;
    }
    await new Promise((resolve) => this.client.close(resolve));
    this.connected = false;
  }
}

module.exports = { ModbusDriver };
