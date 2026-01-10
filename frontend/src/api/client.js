import axios from 'axios';
import { API_BASE_URL } from '../config';

export const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined
});

export const deleteTableRow = (tableName, primaryKey) =>
  apiClient.delete(`/api/tables/${tableName}/rows`, {
    data: { primaryKey }
  });
