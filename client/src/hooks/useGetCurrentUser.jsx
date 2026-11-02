import axios from 'axios'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { setUserData, setAuthChecked } from '../redux/userSlice'
import { serverUrl } from '../config'

function useGetCurrentUser() {
  const dispatch = useDispatch()

  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const result = await axios.get(`${serverUrl}/api/user/current`, {
          withCredentials: true
        })
        dispatch(setUserData(result.data.user))  // sets authChecked = true
      } catch {
        dispatch(setAuthChecked())  // auth failed but checked = true, don't loop
      }
    }
    getCurrentUser()
  }, [dispatch])
}

export default useGetCurrentUser
