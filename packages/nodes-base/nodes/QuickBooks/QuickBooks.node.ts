import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	billFields,
	billOperations,
	customerFields,
	customerOperations,
	estimateFields,
	estimateOperations,
	invoiceFields,
	invoiceOperations,
	itemFields,
	itemOperations,
	paymentFields,
	paymentOperations,
	vendorFields,
	vendorOperations,
} from './descriptions';

import {
	getSyncToken,
	handleBinaryData,
	handleListing,
	loadResource,
	quickBooksApiRequest,
} from './GenericFunctions';

import {
	isEmpty,
	pickBy,
} from 'lodash';

import {
	AltBillAddr,
	Line,
	Ref,
} from './descriptions/Shared/Shared.interface';

export class QuickBooks implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'QuickBooks',
		name: 'quickbooks',
		icon: 'file:quickbooks.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the QuickBooks API',
		defaults: {
			name: 'QuickBooks',
			color: '#2CA01C',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'quickBooksOAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Bill',
						value: 'bill',
					},
					{
						name: 'Customer',
						value: 'customer',
					},
					{
						name: 'Estimate',
						value: 'estimate',
					},
					{
						name: 'Invoice',
						value: 'invoice',
					},
					{
						name: 'Item',
						value: 'item',
					},
					{
						name: 'Payment',
						value: 'payment',
					},
					{
						name: 'Vendor',
						value: 'vendor',
					},
				],
				default: 'customer',
				description: 'Resource to consume',
			},
			...billOperations,
			...billFields,
			...customerOperations,
			...customerFields,
			...estimateOperations,
			...estimateFields,
			...invoiceOperations,
			...invoiceFields,
			...itemOperations,
			...itemFields,
			...paymentOperations,
			...paymentFields,
			...vendorOperations,
			...vendorFields,
		],
	};

	methods = {
		loadOptions: {
			async getCustomers(this: ILoadOptionsFunctions) {
				return await loadResource.call(this, 'customer');
			},

			async getVendors(this: ILoadOptionsFunctions) {
				return await loadResource.call(this, 'vendor');
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		let items = this.getInputData();

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		let responseData;
		const returnData: IDataObject[] = [];

		const { companyId } = this.getCredentials('quickBooksOAuth2Api') as { companyId: string };

		for (let i = 0; i < items.length; i++) {

			// *********************************************************************
			// 															  bill
			// *********************************************************************

			if (resource === 'bill')	{

				// ----------------------------------
				//         bill: create
				// ----------------------------------

				if (operation === 'create') {

					const vendorId = this.getNodeParameter('VendorRef', i) as IDataObject;
					const lines = this.getNodeParameter('Line', i) as Line[];

					if (!lines.length) {
						throw new Error('Please enter at least one line for the bill.');
					}

					lines.forEach(line => {
						if (!line.DetailType || !line.Amount || !line.Description) {
							throw new Error('Please enter at least a detail type, an amount and a description for every line.');
						}
					});

					const body = {
						VendorRef: {
							value: vendorId,
						},
						Line: lines,
					} as IDataObject;

					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

					Object.entries(additionalFields).forEach(([key, value]) => {
						if (key === 'APAccountRef' || key === 'SalesTermRef') {
							const { details } = value as { details: Ref };
							body.APAccountRef = {
								name: details.name,
								value: details.value,
							};

						} else {
							body[key] = value;
						}
					});

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, {}, body);

				// ----------------------------------
				//         bill: get
				// ----------------------------------

				} else if (operation === 'get') {

					const billId = this.getNodeParameter('billId', i);
					const endpoint = `/v3/company/${companyId}/${resource}/${billId}`;
					responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

				// ----------------------------------
				//         bill: getAll
				// ----------------------------------

				} else if (operation === 'getAll') {

					const endpoint = `/v3/company/${companyId}/query`;
					responseData = await handleListing.call(this, i, endpoint, resource);

				// ----------------------------------
				//         bill: update
				// ----------------------------------

				} else if (operation === 'update') {

					// ...

				}

			// *********************************************************************
			// 															customer
			// *********************************************************************

			} else if (resource === 'customer') {

				// ----------------------------------
				//         customer: create
				// ----------------------------------

				if (operation === 'create') {

					const body = {
						DisplayName: this.getNodeParameter('displayName', i),
					} as IDataObject;

					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

					Object.entries(additionalFields).forEach(([key, value]) => {
						if (key === 'BillingAddress') {
							const { details } = value as { details: AltBillAddr };
							body.BillAddr = pickBy(details, d => d !== '');

						} else if (key === 'PrimaryEmailAddr') {
							body.PrimaryEmailAddr = {
								Address: value,
							};

						} else if (key === 'PrimaryPhone') {
							body.PrimaryPhone = {
								FreeFormNumber: value,
							};

						} else {
							body[key] = value;
						}
					});

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, {}, body);

				// ----------------------------------
				//         customer: get
				// ----------------------------------

				} else if (operation === 'get') {

					const customerId = this.getNodeParameter('customerId', i);
					const endpoint = `/v3/company/${companyId}/${resource}/${customerId}`;
					responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

				// ----------------------------------
				//         customer: getAll
				// ----------------------------------

				} else if (operation === 'getAll') {

					const endpoint = `/v3/company/${companyId}/query`;
					responseData = await handleListing.call(this, i, endpoint, resource);

				// ----------------------------------
				//         customer: update
				// ----------------------------------

				} else if (operation === 'update') {

					const body = {
						Id: this.getNodeParameter('customerId', i),
						SyncToken: await getSyncToken.call(this, i, companyId, resource),
						sparse: true,
					} as IDataObject;

					const updateFields = this.getNodeParameter('updateFields', i) as IDataObject;

					if (isEmpty(updateFields)) {
						throw new Error('Please enter at least one field to update for the customer.');
					}

					// TODO

					// Object.entries(updateFields).forEach(([key, value]) => {
					// 	if (key === 'PrimaryEmailAddr') {
					// 		body.PrimaryEmailAddr = { Address: value };
					// 	} else if (key === 'BillingAddress') {
					// 		const { details } = value as CustomerBillingAddress;
					// 		body.BillAddr = pickBy(details, d => d !== '');
					// 	} else {
					// 		body[key] = value;
					// 	}
					// });

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, {}, body);

				}

		// *********************************************************************
		// 															employee
		// *********************************************************************

		} else if (resource === 'employee') {

			// ----------------------------------
			//         employee: create
			// ----------------------------------

			if (operation === 'create') {

				const body = {
					DisplayName: this.getNodeParameter('displayName', i),
				} as IDataObject;

				const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;
				Object.keys(additionalFields).forEach(key => body[key] = additionalFields[key]);

				const endpoint = `/v3/company/${companyId}/${resource}`;
				responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, {}, body);

			// ----------------------------------
			//         employee: get
			// ----------------------------------

			} else if (operation === 'get') {

				const employeeId = this.getNodeParameter('employeeId', i);
				const endpoint = `/v3/company/${companyId}/${resource}/${employeeId}`;
				responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

			// ----------------------------------
			//         employee: getAll
			// ----------------------------------

			} else if (operation === 'getAll') {

				const endpoint = `/v3/company/${companyId}/query`;
				responseData = await handleListing.call(this, i, endpoint, resource);

			// ----------------------------------
			//         employee: update
			// ----------------------------------

			} else if (operation === 'update') {

				// ...

			}

			// *********************************************************************
			// 															estimate
			// *********************************************************************

			} else if (resource === 'estimate') {

				// ----------------------------------
				//         estimate: create
				// ----------------------------------

				if (operation === 'create') {

					// ...

				// ----------------------------------
				//         estimate: get
				// ----------------------------------

				} else if (operation === 'get') {

					const estimateId = this.getNodeParameter('estimateId', i) as string;
					const download = this.getNodeParameter('download', i) as boolean;

					if (download) {

						items = await handleBinaryData.call(this, items, i, companyId, resource, estimateId);
						return this.prepareOutputData(items);

					} else {

						const endpoint = `/v3/company/${companyId}/${resource}/${estimateId}`;
						responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

					}

				// ----------------------------------
				//         estimate: getAll
				// ----------------------------------

				} else if (operation === 'getAll') {

					const endpoint = `/v3/company/${companyId}/query`;
					responseData = await handleListing.call(this, i, endpoint, resource);

				// ----------------------------------
				//         estimate: update
				// ----------------------------------

				} else if (operation === 'update') {

					// ...

				}

			// *********************************************************************
			// 															invoice
			// *********************************************************************

			} else if (resource === 'invoice') {

				// ----------------------------------
				//         invoice: create
				// ----------------------------------

				if (operation === 'create') {

					// ...

				// ----------------------------------
				//         invoice: delete
				// ----------------------------------

				} else if (operation === 'delete') {

					const qs = {
						operation: 'delete',
					} as IDataObject;

					const body = {
						Id: this.getNodeParameter('invoiceId', i),
						SyncToken: await getSyncToken.call(this, i, companyId, resource),
					} as IDataObject;

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, qs, body);

				// ----------------------------------
				//         invoice: get
				// ----------------------------------

				} else if (operation === 'get') {

					const invoiceId = this.getNodeParameter('invoiceId', i) as string;
					const download = this.getNodeParameter('download', i) as boolean;

					if (download) {

						items = await handleBinaryData.call(this, items, i, companyId, resource, invoiceId);
						return this.prepareOutputData(items);

					} else {

						const endpoint = `/v3/company/${companyId}/${resource}/${invoiceId}`;
						responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

					}

				// ----------------------------------
				//         invoice: getAll
				// ----------------------------------

				} else if (operation === 'getAll') {

					const endpoint = `/v3/company/${companyId}/query`;
					responseData = await handleListing.call(this, i, endpoint, resource);

				// ----------------------------------
				//         invoice: send
				// ----------------------------------

				} else if (operation === 'send') {

					const invoiceId = this.getNodeParameter('invoiceId', i) as string;

					const qs = {
						sendTo: this.getNodeParameter('email', i) as string,
					} as IDataObject;

					const endpoint = `/v3/company/${companyId}/${resource}/${invoiceId}/send`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, qs, {});

				// ----------------------------------
				//         invoice: update
				// ----------------------------------

				} else if (operation === 'update') {

					// ...

				// ----------------------------------
				//         invoice: void
				// ----------------------------------

				} else if (operation === 'void') {

					const qs = {
						Id: this.getNodeParameter('invoiceId', i),
						SyncToken: await getSyncToken.call(this, i, companyId, resource),
						operation: 'void',
					} as IDataObject;

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, qs, {});

				}

			// *********************************************************************
			// 															payment
			// *********************************************************************

			} else if (resource === 'payment') {

				// ----------------------------------
				//         payment: create
				// ----------------------------------

				if (operation === 'create') {

					// ...

				// ----------------------------------
				//         payment: delete
				// ----------------------------------

				} else if (operation === 'delete') {

					const qs = {
						operation: 'delete',
					} as IDataObject;

					const body = {
						Id: this.getNodeParameter('paymentId', i),
						SyncToken: await getSyncToken.call(this, i, companyId, resource),
					} as IDataObject;

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, qs, body);

				// ----------------------------------
				//         payment: get
				// ----------------------------------

				} else if (operation === 'get') {

					const paymentId = this.getNodeParameter('paymentId', i) as string;
					const download = this.getNodeParameter('download', i) as boolean;

					if (download) {

						// TODO: Refactor into single line, with `prepareOutputData` inside `handleBinaryData`
						items = await handleBinaryData.call(this, items, i, companyId, resource, paymentId);
						return this.prepareOutputData(items);

					} else {

						const endpoint = `/v3/company/${companyId}/${resource}/${paymentId}`;
						responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

					}

				// ----------------------------------
				//         payment: getAll
				// ----------------------------------

				} else if (operation === 'getAll') {

					const endpoint = `/v3/company/${companyId}/query`;
					responseData = await handleListing.call(this, i, endpoint, resource);

				// ----------------------------------
				//         payment: send
				// ----------------------------------

				} else if (operation === 'send') {

					const paymentId = this.getNodeParameter('paymentId', i) as string;

					const qs = {
						sendTo: this.getNodeParameter('email', i) as string,
					} as IDataObject;

					const endpoint = `/v3/company/${companyId}/${resource}/${paymentId}/send`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, qs, {});

				// ----------------------------------
				//         payment: update
				// ----------------------------------

				} else if (operation === 'update') {

					// ...

				// ----------------------------------
				//         payment: void
				// ----------------------------------

				} else if (operation === 'void') {

					const qs = {
						Id: this.getNodeParameter('paymentId', i),
						SyncToken: await getSyncToken.call(this, i, companyId, resource),
						operation: 'void',
					} as IDataObject;

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, qs, {});

				}

			// *********************************************************************
			// 															vendor
			// *********************************************************************

			} else if (resource === 'vendor') {

				// ----------------------------------
				//         vendor: create
				// ----------------------------------

				if (operation === 'create') {

					const body = {
						DisplayName: this.getNodeParameter('displayName', i),
					} as IDataObject;

					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;
					Object.keys(additionalFields).forEach(key => body[key] = additionalFields[key]);

					const endpoint = `/v3/company/${companyId}/${resource}`;
					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, {}, body);

				// ----------------------------------
				//         vendor: get
				// ----------------------------------

				} else if (operation === 'get') {

					const vendorId = this.getNodeParameter('vendorId', i);
					const endpoint = `/v3/company/${companyId}/${resource}/${vendorId}`;
					responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

				// ----------------------------------
				//         vendor: getAll
				// ----------------------------------

				} else if (operation === 'getAll') {

					const endpoint = `/v3/company/${companyId}/query`;
					responseData = await handleListing.call(this, i, endpoint, resource);

				// ----------------------------------
				//         vendor: update
				// ----------------------------------

				} else if (operation === 'update') {

					// ...

				}

			}

			Array.isArray(responseData)
				? returnData.push(...responseData)
				: returnData.push(responseData);

			}

		return [this.helpers.returnJsonArray(returnData)];

	}
}