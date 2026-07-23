// عقود قدرات المنصّة الأخرى (Maps / Storage / AI / Delivery / CRM / ERP).
// واجهات منفصلة (ISP) — كل قدرة عقد مستقل قابل للتوسّع بمزوّدين متعدّدين.

import { IntegrationAdapter } from '../IntegrationAdapter'
import { notImplemented } from '../../errors'

export class MapsContract extends IntegrationAdapter {
  /** @param {string} _address */ async geocode(_address) { return notImplemented('MapsContract.geocode') }
  /** @param {number} _lat @param {number} _lng */ async reverseGeocode(_lat, _lng) { return notImplemented('MapsContract.reverseGeocode') }
  /** @param {Object} _from @param {Object} _to */ async distance(_from, _to) { return notImplemented('MapsContract.distance') }
}

export class StorageContract extends IntegrationAdapter {
  /** @param {Object} _file */ async upload(_file) { return notImplemented('StorageContract.upload') }
  /** @param {string} _ref */ async remove(_ref) { return notImplemented('StorageContract.remove') }
  /** @param {string} _ref */ async getUrl(_ref) { return notImplemented('StorageContract.getUrl') }
}

export class AiContract extends IntegrationAdapter {
  /** @param {Object} _req (messages|prompt, options) */ async complete(_req) { return notImplemented('AiContract.complete') }
  /** @param {Object} _req */ async embed(_req) { return notImplemented('AiContract.embed') }
}

export class DeliveryContract extends IntegrationAdapter {
  /** @param {Object} _order */ async createShipment(_order) { return notImplemented('DeliveryContract.createShipment') }
  /** @param {string} _ref */ async track(_ref) { return notImplemented('DeliveryContract.track') }
  /** @param {string} _ref */ async cancel(_ref) { return notImplemented('DeliveryContract.cancel') }
  /** @param {unknown} _payload @param {Record<string,string>} _headers */ parseWebhook(_payload, _headers) { return notImplemented('DeliveryContract.parseWebhook') }
}

export class CrmContract extends IntegrationAdapter {
  /** @param {Object} _contact */ async upsertContact(_contact) { return notImplemented('CrmContract.upsertContact') }
  /** @param {Object} _event */ async trackEvent(_event) { return notImplemented('CrmContract.trackEvent') }
}

export class ErpContract extends IntegrationAdapter {
  /** @param {Object} _doc */ async syncDocument(_doc) { return notImplemented('ErpContract.syncDocument') }
  /** @param {string} _ref */ async fetchDocument(_ref) { return notImplemented('ErpContract.fetchDocument') }
}
